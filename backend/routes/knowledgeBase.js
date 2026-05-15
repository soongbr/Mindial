/**
 * 知识库路由
 * 处理知识库文档上传和解析
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const documentParser = require('../services/documentParser');
const chatService = require('../services/chatService');

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 限制
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.docx', '.doc', '.md', '.markdown', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}`));
    }
  }
});

/**
 * 上传并解析知识库文档
 * POST /api/knowledge-base/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    console.log('Parsing uploaded file:', fileName);

    // 1. 解析文档内容
    const content = await documentParser.parseDocument(filePath, req.file.mimetype);
    console.log('Document parsed, content length:', content.length);

    // 2. 获取 API 配置
    const apiConfig = {
      hostname: 'api.minimaxi.com',
      path: '/anthropic/v1/messages',
      model: 'MiniMax-M2.7',
      apiKey: process.env.MINIMAX_API_KEY
    };

    // 3. AI 分析并生成思维导图结构
    console.log('Analyzing document structure...');
    const mindMapStructure = await documentParser.analyzeAndGenerateMindMap(
      content, 
      fileName, 
      apiConfig
    );

    // 4. 生成节点树
    const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
    const rootId = generateId();
    const nodes = {};

    // 创建根节点
    nodes[rootId] = {
      id: rootId,
      parentId: null,
      question: mindMapStructure.root.title,
      summary: mindMapStructure.root.summary,
      answer: '',  // 导入模式暂无回答
      concepts: [],
      children: [],
      createdAt: Date.now(),
      isStreamed: false,
      isImported: true,
      sourceFile: fileName
    };

    // 创建子节点
    for (const nodeData of mindMapStructure.nodes) {
      const nodeId = generateId();
      nodes[nodeId] = {
        id: nodeId,
        parentId: rootId,
        question: nodeData.title,
        summary: nodeData.summary,
        answer: '',  // 等待用户追问时填充
        concepts: [],
        children: [],
        createdAt: Date.now(),
        isStreamed: false,
        isImported: true,
        sourceFile: fileName
      };
      nodes[rootId].children.push(nodeId);
    }

    // 5. 保存到对话数据
    const tree = {
      rootId,
      nodes,
      currentNodeId: rootId,
      collapsedNodeIds: [],
      isImported: true
    };

    // 保存到 conversations
    const conversationId = await saveImportedConversation(fileName, tree);

    // 6. 清理上传的文件
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      conversationId,
      tree,
      stats: {
        totalNodes: Object.keys(nodes).length,
        fileName,
        contentLength: content.length
      }
    });

  } catch (err) {
    console.error('Knowledge base upload error:', err);
    
    // 清理上传的文件
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: err.message || '解析失败' });
  }
});

/**
 * 解析飞书文档
 * POST /api/knowledge-base/feishu
 */
router.post('/feishu', async (req, res) => {
  try {
    const { docToken } = req.body;
    
    if (!docToken) {
      return res.status(400).json({ error: '缺少文档 token' });
    }

    console.log('Fetching Feishu doc:', docToken);

    // 调用飞书 API 获取文档内容
    // 注意：需要飞书 access token，这里简化处理
    const feishuToken = process.env.FEISHU_ACCESS_TOKEN;
    
    if (!feishuToken) {
      return res.status(400).json({ error: '飞书 Access Token 未配置' });
    }

    const https = require('https');
    const tokenUrl = `https://open.feishu.cn/open-apis/doc/v2/${docToken}/raw_content`;
    
    const content = await new Promise((resolve, reject) => {
      const req = https.request(tokenUrl, {
        headers: {
          'Authorization': `Bearer ${feishuToken}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.end();
    });

    // 解析内容并生成思维导图
    const apiConfig = {
      hostname: 'api.minimaxi.com',
      path: '/anthropic/v1/messages',
      model: 'MiniMax-M2.7',
      apiKey: process.env.MINIMAX_API_KEY
    };

    console.log('Analyzing Feishu doc structure...');
    const mindMapStructure = await documentParser.analyzeAndGenerateMindMap(
      content,
      `飞书文档-${docToken}`,
      apiConfig
    );

    // 生成节点树（同上）
    const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
    const rootId = generateId();
    const nodes = {};

    nodes[rootId] = {
      id: rootId,
      parentId: null,
      question: mindMapStructure.root.title,
      summary: mindMapStructure.root.summary,
      answer: '',
      concepts: [],
      children: [],
      createdAt: Date.now(),
      isStreamed: false,
      isImported: true,
      sourceFile: `飞书文档-${docToken}`
    };

    for (const nodeData of mindMapStructure.nodes) {
      const nodeId = generateId();
      nodes[nodeId] = {
        id: nodeId,
        parentId: rootId,
        question: nodeData.title,
        summary: nodeData.summary,
        answer: '',
        concepts: [],
        children: [],
        createdAt: Date.now(),
        isStreamed: false,
        isImported: true,
        sourceFile: `飞书文档-${docToken}`
      };
      nodes[rootId].children.push(nodeId);
    }

    const tree = {
      rootId,
      nodes,
      currentNodeId: rootId,
      collapsedNodeIds: [],
      isImported: true
    };

    const conversationId = await saveImportedConversation(`飞书文档-${docToken}`, tree);

    res.json({
      success: true,
      conversationId,
      tree,
      stats: {
        totalNodes: Object.keys(nodes).length,
        source: 'feishu'
      }
    });

  } catch (err) {
    console.error('Feishu doc parse error:', err);
    res.status(500).json({ error: err.message || '飞书文档解析失败' });
  }
});

/**
 * 保存导入的对话
 */
async function saveImportedConversation(fileName, tree) {
  const dataDir = path.join(__dirname, '..', 'data');
  const conversationsFile = path.join(dataDir, 'conversations.json');
  
  let conversations = [];
  if (fs.existsSync(conversationsFile)) {
    conversations = JSON.parse(fs.readFileSync(conversationsFile, 'utf-8'));
  }

  const conversationId = Math.random().toString(36).substring(2, 15);
  const conversation = {
    id: conversationId,
    title: `[导入] ${fileName}`,
    tree,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isImported: true
  };

  conversations.unshift(conversation);
  fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2));
  
  return conversationId;
}

module.exports = router;
