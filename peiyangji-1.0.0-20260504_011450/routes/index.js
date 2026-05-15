const express = require('express');
const router = express.Router();
const chatService = require('../services/chatService');

// POST /api/chat - 发送消息，获取AI回答（非流式）
router.post('/chat', async (req, res) => {
  try {
    const { message, useMCP, detailLevel } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    const result = await chatService.getChatResponse(message, useMCP, detailLevel);
    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'AI服务调用失败: ' + error.message });
  }
});

// POST /api/chat/stream - 流式聊天响应 (SSE)
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, detailLevel } = req.body;
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

    await chatService.getChatResponseStream(message, detailLevel, res);
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

// GET /api/mcp-search - MCP联网搜索
router.get('/mcp-search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'q is required' });
    }
    const result = await chatService.mcpSearch(q);
    res.json(result);
  } catch (error) {
    console.error('MCP search error:', error);
    res.status(500).json({ error: 'MCP搜索失败' });
  }
});

module.exports = router;