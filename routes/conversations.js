const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// 数据存储路径
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化文件
if (!fs.existsSync(CONVERSATIONS_FILE)) {
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({ conversations: [], currentConversationId: null }, null, 2));
}

/**
 * 加载对话列表
 */
function loadConversations() {
  try {
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load conversations:', err);
    return { conversations: [], currentConversationId: null };
  }
}

/**
 * 保存对话列表
 */
function saveConversations(data) {
  try {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to save conversations:', err);
    return false;
  }
}

/**
 * 生成对话标题（取第一个节点问题前 20 字）
 */
function generateTitle(tree) {
  if (!tree || !tree.rootId || !tree.nodes[tree.rootId]) {
    return '新对话';
  }
  const firstNode = tree.nodes[tree.rootId];
  const question = firstNode.question || '新对话';
  return question.length > 20 ? question.slice(0, 20) + '...' : question;
}

/**
 * GET /api/conversations - 获取对话列表
 */
router.get('/', (req, res) => {
  try {
    const data = loadConversations();
    // 按用户过滤对话
    const userId = req.user?.id;
    const filtered = userId
      ? data.conversations.filter(c => !c.userId || c.userId === userId)
      : data.conversations;
    // 返回列表时不包含完整的 tree 数据，减少传输量
    const summary = filtered.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
    // 当前对话也需要检查归属
    const currentConv = data.currentConversationId
      ? filtered.find(c => c.id === data.currentConversationId)
      : null;
    res.json({
      conversations: summary,
      currentConversationId: currentConv ? data.currentConversationId : null
    });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

/**
 * GET /api/conversations/:id - 获取单个对话详情
 */
router.get('/:id', (req, res) => {
  try {
    const data = loadConversations();
    const conversation = data.conversations.find(c => c.id === req.params.id);
    
    if (!conversation) {
      return res.status(404).json({ error: '对话不存在' });
    }
    
    // 权限校验
    const userId = req.user?.id;
    if (userId && conversation.userId && conversation.userId !== userId) {
      return res.status(403).json({ error: '无权访问该对话' });
    }
    
    res.json(conversation);
  } catch (err) {
    console.error('Get conversation error:', err);
    res.status(500).json({ error: '获取对话详情失败' });
  }
});

/**
 * POST /api/conversations - 创建新对话
 */
router.post('/', (req, res) => {
  try {
    const { tree } = req.body;
    
    if (!tree || !tree.rootId) {
      return res.status(400).json({ error: '对话数据无效' });
    }
    
    const data = loadConversations();
    
    const newConversation = {
      id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      title: generateTitle(tree),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tree,
      userId: req.user?.id || null
    };
    
    data.conversations.unshift(newConversation); // 添加到开头
    data.currentConversationId = newConversation.id;
    
    if (saveConversations(data)) {
      res.json({
        success: true,
        conversation: {
          id: newConversation.id,
          title: newConversation.title,
          createdAt: newConversation.createdAt
        }
      });
    } else {
      res.status(500).json({ error: '保存失败' });
    }
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ error: '创建对话失败' });
  }
});

/**
 * PUT /api/conversations/:id - 更新对话
 */
router.put('/:id', (req, res) => {
  try {
    const { tree } = req.body;
    const data = loadConversations();
    
    const index = data.conversations.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: '对话不存在' });
    }
    
    // 权限校验
    const userId = req.user?.id;
    if (userId && data.conversations[index].userId && data.conversations[index].userId !== userId) {
      return res.status(403).json({ error: '无权修改该对话' });
    }
    
    // 更新对话
    data.conversations[index] = {
      ...data.conversations[index],
      tree,
      updatedAt: Date.now(),
      // 如果标题是自动生成的，更新标题
      title: data.conversations[index].title === '新对话' ? generateTitle(tree) : data.conversations[index].title
    };
    
    // 移到开头
    const [updated] = data.conversations.splice(index, 1);
    data.conversations.unshift(updated);
    
    if (saveConversations(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: '保存失败' });
    }
  } catch (err) {
    console.error('Update conversation error:', err);
    res.status(500).json({ error: '更新对话失败' });
  }
});

/**
 * DELETE /api/conversations/:id - 删除对话
 */
router.delete('/:id', (req, res) => {
  try {
    const data = loadConversations();
    const index = data.conversations.findIndex(c => c.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: '对话不存在' });
    }
    
    // 权限校验
    const userId = req.user?.id;
    if (userId && data.conversations[index].userId && data.conversations[index].userId !== userId) {
      return res.status(403).json({ error: '无权删除该对话' });
    }
    
    // 删除对话
    data.conversations.splice(index, 1);
    
    // 如果删除的是当前对话，清空当前选择
    if (data.currentConversationId === req.params.id) {
      data.currentConversationId = null;
    }
    
    if (saveConversations(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: '保存失败' });
    }
  } catch (err) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ error: '删除对话失败' });
  }
});

/**
 * PUT /api/conversations/current/:id - 设置当前对话
 */
router.put('/current/:id', (req, res) => {
  try {
    const data = loadConversations();
    
    // 验证对话是否存在 + 权限校验
    const userId = req.user?.id;
    const conv = data.conversations.find(c => c.id === req.params.id);
    if (!conv) {
      return res.status(404).json({ error: '对话不存在' });
    }
    if (userId && conv.userId && conv.userId !== userId) {
      return res.status(403).json({ error: '无权访问该对话' });
    }
    
    data.currentConversationId = req.params.id;
    
    if (saveConversations(data)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: '保存失败' });
    }
  } catch (err) {
    console.error('Set current conversation error:', err);
    res.status(500).json({ error: '设置当前对话失败' });
  }
});

module.exports = router;
