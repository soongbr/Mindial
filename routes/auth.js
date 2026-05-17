const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authMiddleware, generateToken } = require('../middleware/auth');
const loginRateLimiter = require('../middleware/rateLimiter');

const router = express.Router();
const BCRYPT_COST = 12;

/**
 * POST /api/auth/verify-code
 * 校验邀请码是否有效
 */
router.post('/verify-code', (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({ valid: false, error: '邀请码不能为空' });
    }

    const cleanCode = code.trim().toUpperCase();
    const db = getDb();

    const row = db.prepare('SELECT code, used, created_at FROM invite_codes WHERE code = ?').get(cleanCode);

    if (!row) {
      return res.json({ valid: false, error: '邀请码无效' });
    }

    if (row.used) {
      return res.json({ valid: false, error: '邀请码已被使用' });
    }

    // 检查3天有效期
    const createdAt = new Date(row.created_at + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours > 72) {
      return res.json({ valid: false, error: '邀请码已过期（超过3天），请联系管理员获取新邀请码' });
    }

    return res.json({ valid: true, code: cleanCode });
  } catch (err) {
    console.error('Verify code error:', err);
    return res.status(500).json({ valid: false, error: '服务器内部错误' });
  }
});

/**
 * POST /api/auth/register
 * 用户注册（需邀请码）
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, code: inviteCode } = req.body;

    // === 输入校验 ===
    const errors = [];

    // 邮箱校验
    if (!email || typeof email !== 'string') {
      errors.push('邮箱不能为空');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        errors.push('邮箱格式不正确');
      }
    }

    // 密码校验
    if (!password || typeof password !== 'string') {
      errors.push('密码不能为空');
    } else if (password.length < 8) {
      errors.push('密码至少需要8位字符');
    }

    // 邀请码校验
    if (!inviteCode || typeof inviteCode !== 'string' || inviteCode.trim().length === 0) {
      errors.push('邀请码不能为空');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('；') });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = inviteCode.trim().toUpperCase();
    const db = getDb();

    // === 校验邀请码 ===
    const codeRow = db.prepare('SELECT code, used, created_at FROM invite_codes WHERE code = ?').get(cleanCode);

    if (!codeRow) {
      return res.status(400).json({ error: '邀请码无效' });
    }

    if (codeRow.used) {
      return res.status(400).json({ error: '邀请码已被使用' });
    }

    // 检查3天有效期
    const codeCreatedAt = new Date(codeRow.created_at + 'Z');
    const now = new Date();
    const diffHours = (now.getTime() - codeCreatedAt.getTime()) / (1000 * 60 * 60);
    if (diffHours > 72) {
      return res.status(400).json({ error: '邀请码已过期（超过3天），请联系管理员获取新邀请码' });
    }

    // === 检查邮箱是否已注册 ===
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingUser) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    // === 创建用户 + 标记邀请码已用（事务） ===
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const createUser = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO users (email, password_hash, last_login, created_at) VALUES (?, ?, datetime(\'now\'), datetime(\'now\'))'
      ).run(cleanEmail, passwordHash);

      const userId = result.lastInsertRowid;

      db.prepare(
        'UPDATE invite_codes SET used = 1, used_by = ? WHERE code = ?'
      ).run(userId, cleanCode);

      return userId;
    });

    const userId = createUser();

    // 注册即登录，返回 JWT
    const token = generateToken({ id: userId, email: cleanEmail });

    // 检查是否为管理员
    function isAdminCheck(id) {
      const adminUid = process.env.ADMIN_UID;
      if (adminUid) {
        const adminIds = adminUid.split(',').map(i => parseInt(i.trim(), 10));
        return adminIds.includes(id);
      }
      return id === 1;
    }

    console.log(`✅ 新用户注册: ${cleanEmail} (id=${userId})`);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email: cleanEmail,
        createdAt: new Date().toISOString(),
        isAdmin: isAdminCheck(userId),
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    // 唯一约束冲突
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }
    return res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

/**
 * POST /api/auth/login
 * 用户登录（带限流保护）
 */
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 输入校验
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: '输入格式不正确' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = getDb();

    // 查找用户
    const user = db.prepare('SELECT id, email, password_hash, last_login, created_at FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 验证密码
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 更新最后登录时间
    db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

    // 生成 JWT
    const token = generateToken({ id: user.id, email: user.email });

    // 检查是否为管理员
    function isAdminCheck(id) {
      const adminUid = process.env.ADMIN_UID;
      if (adminUid) {
        const adminIds = adminUid.split(',').map(i => parseInt(i.trim(), 10));
        return adminIds.includes(id);
      }
      return id === 1;
    }

    console.log(`✅ 用户登录: ${user.email}`);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        lastLogin: new Date().toISOString(),
        isAdmin: isAdminCheck(user.id),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

/**
 * GET /api/auth/me
 * 获取当前登录用户信息（需认证）
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, last_login, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查是否为管理员
    const adminUid = process.env.ADMIN_UID;
    let isAdmin = false;
    if (adminUid) {
      const adminIds = adminUid.split(',').map(id => parseInt(id.trim(), 10));
      isAdmin = adminIds.includes(user.id);
    } else {
      // 如果没配置 ADMIN_UID，id=1 是默认管理员
      isAdmin = user.id === 1;
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        isAdmin,
      },
    });
  } catch (err) {
    console.error('Get user info error:', err);
    return res.status(500).json({ error: '获取用户信息失败' });
  }
});

module.exports = router;
