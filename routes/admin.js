const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();
const BCRYPT_COST = 12;

// 所有管理端路由都需要认证 + 管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

// === 用户管理 ===

/**
 * GET /api/admin/users
 * 获取用户列表
 */
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(
      'SELECT id, email, last_login, created_at FROM users ORDER BY created_at DESC'
    ).all();

    return res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ error: '获取用户列表失败' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * 删除用户（同时删除其相关数据）
 */
router.delete('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ error: '无效的用户 ID' });
    }

    // 不能删除自己
    if (userId === req.user.id) {
      return res.status(400).json({ error: '不能删除自己的管理员账号' });
    }

    const db = getDb();

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 事务：删除用户、释放邀请码、删除知识库数据
    db.transaction(() => {
      // 释放该用户使用过的邀请码
      db.prepare('UPDATE invite_codes SET used = 0, used_by = NULL WHERE used_by = ?').run(userId);

      // 删除用户
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    })();

    // 清理 conversations.json 中该用户的对话
    try {
      const fs = require('fs');
      const path = require('path');
      const conversationsFile = path.join(__dirname, '..', 'data', 'conversations.json');
      if (fs.existsSync(conversationsFile)) {
        const convData = JSON.parse(fs.readFileSync(conversationsFile, 'utf-8'));
        const before = convData.conversations.length;
        convData.conversations = convData.conversations.filter(c => c.userId !== userId);
        if (convData.currentConversationId) {
          const stillExists = convData.conversations.some(c => c.id === convData.currentConversationId);
          if (!stillExists) convData.currentConversationId = null;
        }
        fs.writeFileSync(conversationsFile, JSON.stringify(convData, null, 2));
        console.log(`🗑️  清理了 ${before - convData.conversations.length} 个对话`);
      }
    } catch (e) {
      console.warn('清理 conversations.json 失败:', e.message);
    }

    console.log(`🗑️  管理员删除了用户: id=${userId}`);

    return res.json({ success: true, message: '用户已删除' });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ error: '删除用户失败' });
  }
});

/**
 * PUT /api/admin/users/:id/password
 * 管理员重置用户密码
 */
router.put('/users/:id/password', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ error: '无效的用户 ID' });
    }

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: '新密码至少需要8位字符' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

    console.log(`🔑 管理员重置了用户密码: id=${userId}`);

    return res.json({ success: true, message: '密码已重置' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: '重置密码失败' });
  }
});

// === 邀请码管理 ===

/**
 * GET /api/admin/codes
 * 获取邀请码列表
 */
router.get('/codes', (req, res) => {
  try {
    const db = getDb();

    const codes = db.prepare(`
      SELECT c.code, c.used, c.used_by, c.created_at,
             u.email as used_by_email
      FROM invite_codes c
      LEFT JOIN users u ON c.used_by = u.id
      ORDER BY c.created_at DESC
    `).all();

    // 计算每个邀请码是否过期（3天）
    const now = new Date();
    const codesWithExpiry = codes.map(c => {
      const createdAt = new Date(c.created_at + 'Z');
      const diffHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      return {
        ...c,
        expired: !c.used && diffHours > 72,
      };
    });

    return res.json({ codes: codesWithExpiry });
  } catch (err) {
    console.error('Get codes error:', err);
    return res.status(500).json({ error: '获取邀请码列表失败' });
  }
});

/**
 * POST /api/admin/codes
 * 生成邀请码
 * Body: { count?: number } 可选，默认生成1个
 */
router.post('/codes', (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.body?.count) || 1, 1), 100); // 1-100个
    const db = getDb();

    const codes = [];
    const insert = db.prepare(
      'INSERT OR IGNORE INTO invite_codes (code, created_at) VALUES (?, datetime(\'now\'))'
    );

    // 批量生成，最多尝试 count*10 次避免冲突
    let attempts = 0;
    while (codes.length < count && attempts < count * 10) {
      attempts++;
      const code = generateCode();
      const result = insert.run(code);
      if (result.changes > 0) {
        codes.push({ code, used: false, created_at: new Date().toISOString() });
      }
    }

    console.log(`🎫 管理员生成了 ${codes.length} 个邀请码`);

    return res.status(201).json({
      success: true,
      codes,
      message: `成功生成 ${codes.length} 个邀请码`,
    });
  } catch (err) {
    console.error('Generate codes error:', err);
    return res.status(500).json({ error: '生成邀请码失败' });
  }
});

/**
 * DELETE /api/admin/codes/:code
 * 作废邀请码
 */
router.delete('/codes/:code', (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    if (!code || code.length === 0) {
      return res.status(400).json({ error: '无效的邀请码' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT code FROM invite_codes WHERE code = ?').get(code);
    if (!existing) {
      return res.status(404).json({ error: '邀请码不存在' });
    }

    db.prepare('DELETE FROM invite_codes WHERE code = ?').run(code);

    console.log(`🗑️  管理员作废了邀请码: ${code}`);

    return res.json({ success: true, message: `邀请码 ${code} 已作废` });
  } catch (err) {
    console.error('Delete code error:', err);
    return res.status(500).json({ error: '作废邀请码失败' });
  }
});

/**
 * 生成6位随机字母数字邀请码
 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = router;
