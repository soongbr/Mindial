const express = require('express');
const router = express.Router();
const chatService = require('../services/chatService');
const conversationsRouter = require('./conversations');
const knowledgeRouter = require('./knowledge');
const authRouter = require('./auth');
const adminRouter = require('./admin');
const { authMiddleware } = require('../middleware/auth');

// 认证路由（公开）
router.use('/auth', authRouter);

// 管理端路由（需认证+管理员权限，在 admin.js 内部校验）
router.use('/admin', adminRouter);

// === 以下路由需要登录认证 ===
router.use(authMiddleware);

// POST /api/chat - 发送消息，获取 AI 回答（非流式）
router.post('/chat', async (req, res) => {
  try {
    const { message, detailLevel } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    const result = await chatService.getChatResponse(message, detailLevel);
    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'AI 服务调用失败：' + error.message });
  }
});

// POST /api/chat/stream - 流式聊天响应 (SSE)
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, detailLevel, enableSearch, enableKnowledgeBase, knowledgeBaseDocumentIds } = req.body;
    if (!message) {
      res.write('event: error\ndata: {"error":"message is required"}\n\n');
      res.end();
      return;
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    await chatService.getChatResponseStream(
      message,
      detailLevel,
      res,
      enableSearch !== false,  // 默认启用
      enableKnowledgeBase !== false,  // 默认为 true
      knowledgeBaseDocumentIds  // 指定要参考的文档 ID 列表
    );
  } catch (error) {
    console.error('Chat stream error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// GET /api/history - 获取知识树数据
router.get('/history', (req, res) => {
  try {
    const tree = chatService.loadTree();
    if (!tree) {
      return res.json({ rootId: null, nodes: {}, currentNodeId: null });
    }
    res.json(tree);
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: '获取历史失败' });
  }
});

// POST /api/save - 保存知识树到 JSON
router.post('/save', (req, res) => {
  try {
    const tree = req.body;
    if (!tree || !tree.rootId) {
      return res.status(400).json({ error: 'Invalid tree data' });
    }
    chatService.saveTree(tree);
    res.json({ success: true, message: '知识树已保存' });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

// 对话历史路由
router.use('/conversations', conversationsRouter);

// 知识库路由
router.use('/knowledge', knowledgeRouter);

module.exports = router;
