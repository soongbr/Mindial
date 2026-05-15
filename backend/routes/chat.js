const express = require('express');
const router = express.Router();
const chatService = require('../services/chatService');

// POST /api/chat - 发送消息，获取AI回答（非流式）
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
    res.status(500).json({ error: 'AI服务调用失败' });
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

module.exports = router;
