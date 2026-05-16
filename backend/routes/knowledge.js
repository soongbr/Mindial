/**
 * Knowledge Base Routes
 * 文件上传、知识库管理 API
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const knowledgeBaseService = require('../services/knowledgeBaseService');
const documentParser = require('../services/documentParser');
const { fixFileNameEncoding } = require('../utils/filename');

const router = express.Router();

// 配置 multer 上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 临时存储目录
    const tempDir = path.join(__dirname, '..', '..', 'data', 'temp');
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`));
    }
  }
});

/**
 * 初始化知识库
 * GET /api/knowledge/init
 */
router.get('/init', async (req, res) => {
  try {
    await knowledgeBaseService.initializeKnowledgeBase();
    res.json({ success: true, message: '知识库初始化成功' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 上传文档（仅存入知识库，不自动生成导图）
 * POST /api/knowledge/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择要上传的文件' });
    }

    const filePath = req.file.path;
    // 修复文件名编码（统一处理，确保 Qdrant 和本地路径都使用正确的文件名）
    const fixedName = fixFileNameEncoding(req.file.originalname);
    req.file.originalname = fixedName;  // 覆盖原始名称，后续 service 层都使用修复后的名字
    const fileSize = req.file.size;

    console.log('Received file:', fixedName, 'Size:', fileSize);

    // 1. 解析文档内容（用于 Qdrant 和本地存储）
    let parsedContent = '';
    try {
      parsedContent = await documentParser.parseDocument(filePath, req.file.mimetype);
      console.log('Document parsed, content length:', parsedContent.length);
    } catch (parseErr) {
      console.warn('Document parse failed:', parseErr.message);
    }

    // 2. 存入 Qdrant 向量数据库（用于 RAG 检索）
    let fileInfo;
    try {
      fileInfo = await knowledgeBaseService.uploadDocument(req.file, req.user?.id);
      // 更新 fileInfo 的 hasMindMap 为 false（新上传的文档没有导图）
      fileInfo.hasMindMap = false;
    } catch (kbErr) {
      console.warn('Qdrant storage failed (non-fatal):', kbErr.message);
      // 如果 Qdrant 失败，保存在本地（传递解析后的内容）
      fileInfo = knowledgeBaseService.addLocalFile(fixedName, fileSize, filePath, parsedContent, req.user?.id);
    }

    // 3. 清理临时文件（uploadDocument 内部已删除，此处为安全兜底）
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}

    console.log('Document uploaded successfully:', fileInfo);

    res.json({
      success: true,
      document: {
        id: fileInfo.id,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        uploadedAt: fileInfo.uploadedAt || Date.now(),
        hasMindMap: false
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ success: false, error: err.message || '上传失败' });
  }
});

/**
 * 保存导入的对话
 */
async function saveImportedConversation(fileName, tree, userId) {
  const dataDir = path.join(__dirname, '..', 'data');
  const conversationsFile = path.join(dataDir, 'conversations.json');

  let data = { conversations: [], currentConversationId: null };
  if (fs.existsSync(conversationsFile)) {
    try {
      const content = fs.readFileSync(conversationsFile, 'utf-8');
      data = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse conversations file:', e);
    }
  }

  const conversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const conversation = {
    id: conversationId,
    title: `[导入] ${fileName}`,
    tree,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isImported: true,
    userId: userId || null
  };

  data.conversations.unshift(conversation);
  data.currentConversationId = conversationId;
  fs.writeFileSync(conversationsFile, JSON.stringify(data, null, 2));

  return conversationId;
}

/**
 * 搜索知识库
 * GET /api/knowledge/search?q=xxx&topK=5&minSimilarity=0.5
 */
router.get('/search', async (req, res) => {
  try {
    const { q, topK, minSimilarity } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, error: '请提供搜索query' });
    }

    const results = await knowledgeBaseService.searchKnowledge(q, {
      topK: parseInt(topK) || 5,
      minSimilarity: parseFloat(minSimilarity) || 0.5
    });

    res.json({ success: true, results });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 获取文档列表（带导图状态）
 * GET /api/knowledge/documents
 */
router.get('/documents', (req, res) => {
  try {
    const documents = knowledgeBaseService.listDocuments(req.user?.id);
    res.json({ success: true, documents });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 为指定文档生成导图
 * POST /api/knowledge/generate-mindmap/:documentId
 */
router.post('/generate-mindmap/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    console.log('Generating mind map for document:', documentId);

    // 1. 获取文档信息
    const documents = knowledgeBaseService.listDocuments(req.user?.id);
    const doc = documents.find(d => d.id === documentId);
    
    if (!doc) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }

    // 权限校验：只允许文档所有者访问
    if (req.user?.id && doc.userId && doc.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: '无权操作该文档' });
    }

    if (doc.hasMindMap) {
      // 已有导图，返回已保存的
      const conversation = knowledgeBaseService.getDocumentConversation(documentId);
      if (conversation) {
        return res.json({
          success: true,
          conversationId: conversation.id,
          tree: conversation.tree,
          stats: { totalNodes: Object.keys(conversation.tree.nodes).length },
          fromCache: true
        });
      }
    }

    // 2. 获取原始文档内容（从 Qdrant 或本地）
    let content = '';
    try {
      content = await knowledgeBaseService.getDocumentContent(documentId, req.user?.id);
    } catch (contentErr) {
      console.warn('Cannot retrieve document content:', contentErr.message);
      return res.status(400).json({ success: false, error: '无法获取文档内容，请重新上传' });
    }

    if (!content || content.length < 10) {
      return res.status(400).json({ success: false, error: '文档内容为空，请确保文档可正常解析' });
    }

    // 3. AI 分析并生成思维导图结构
    const apiConfig = {
      hostname: 'api.minimaxi.com',
      path: '/anthropic/v1/messages',
      model: 'MiniMax-M2.7',
      apiKey: process.env.MINIMAX_API_KEY
    };

    console.log('Analyzing document structure for:', doc.fileName || doc.name);
    const mindMapStructure = await documentParser.analyzeAndGenerateMindMap(
      content,
      doc.fileName || doc.name,
      apiConfig
    );

    // 4. 生成节点树（限制 1-3 级，每级≤5 节点）
    const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
    const rootId = generateId();
    const nodes = {};

    // 创建根节点（使用 summary 作为初始 answer）
    nodes[rootId] = {
      id: rootId,
      parentId: null,
      question: mindMapStructure.root.title,
      summary: mindMapStructure.root.summary,
      answer: mindMapStructure.root.summary || '',
      concepts: [],
      children: [],
      createdAt: Date.now(),
      isStreamed: false,
      isImported: true,
      sourceFile: doc.name,
      sourceDocumentId: documentId
    };

    // 创建子节点（限制≤5个，使用 summary 作为初始 answer）
    const childNodes = (mindMapStructure.nodes || []).slice(0, 5);
    for (const nodeData of childNodes) {
      const nodeId = generateId();
      nodes[nodeId] = {
        id: nodeId,
        parentId: rootId,
        question: nodeData.title,
        summary: nodeData.summary,
        answer: nodeData.summary || '',
        concepts: [],
        children: [],
        createdAt: Date.now(),
        isStreamed: false,
        isImported: true,
        sourceFile: doc.name,
        sourceDocumentId: documentId
      };
      nodes[rootId].children.push(nodeId);
    }

    // 5. 构建树结构
    const tree = {
      rootId,
      nodes,
      currentNodeId: rootId,
      collapsedNodeIds: [],
      isImported: true
    };

    // 6. 保存到 conversations
    const conversationId = await saveImportedConversation(doc.fileName || doc.name, tree, req.user?.id);

    // 7. 更新文档的 hasMindMap 状态
    knowledgeBaseService.markDocumentAsProcessed(documentId, conversationId);

    res.json({
      success: true,
      conversationId,
      tree,
      stats: {
        totalNodes: Object.keys(nodes).length,
        maxLevel: 2,
        fileName: doc.name
      }
    });
  } catch (err) {
    console.error('Generate mind map error:', err);
    res.status(500).json({ success: false, error: err.message || '生成导图失败' });
  }
});

/**
 * 多文档组合生成导图
 * POST /api/knowledge/generate-mindmap-multi
 * Body: { documentIds: string[] }
 */
router.post('/generate-mindmap-multi', async (req, res) => {
  try {
    const { documentIds } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
      return res.status(400).json({ success: false, error: '请至少选择2个文档' });
    }

    console.log('Generating combined mind map for documents:', documentIds);

    // 1. 获取所有文档信息
    const documents = knowledgeBaseService.listDocuments(req.user?.id);
    const selectedDocs = documents.filter(d => documentIds.includes(d.id));
    
    if (selectedDocs.length === 0) {
      return res.status(404).json({ success: false, error: '未找到选中的文档' });
    }

    // 2. 权限校验：只允许文档所有者操作
    for (const doc of selectedDocs) {
      if (req.user?.id && doc.userId && doc.userId !== req.user.id) {
        return res.status(403).json({ success: false, error: `无权操作文档: ${doc.fileName || doc.name}` });
      }
    }

    // 3. 获取所有文档内容并合并
    let combinedContent = '';
    const docNames = [];
    for (const doc of selectedDocs) {
      try {
        const content = await knowledgeBaseService.getDocumentContent(doc.id, req.user?.id);
        if (content) {
          combinedContent += `\n\n=== 文档：${doc.fileName || doc.name} ===\n${content}`;
          docNames.push(doc.fileName || doc.name);
        }
      } catch (contentErr) {
        console.warn('Cannot retrieve content for:', doc.fileName, contentErr.message);
      }
    }

    if (!combinedContent || combinedContent.length < 10) {
      return res.status(400).json({ success: false, error: '所选文档内容为空，请确保文档可正常解析' });
    }

    // 3. AI 分析合并后的内容生成思维导图
    const apiConfig = {
      hostname: 'api.minimaxi.com',
      path: '/anthropic/v1/messages',
      model: 'MiniMax-M2.7',
      apiKey: process.env.MINIMAX_API_KEY
    };

    console.log('Analyzing combined documents...');
    const combinedName = docNames.join(' + ');
    const mindMapStructure = await documentParser.analyzeAndGenerateMindMap(
      combinedContent,
      combinedName,
      apiConfig
    );

    // 4. 生成节点树
    const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
    const rootId = generateId();
    const nodes = {};

    // 创建根节点（使用 summary 作为初始 answer）
    nodes[rootId] = {
      id: rootId,
      parentId: null,
      question: mindMapStructure.root.title,
      summary: mindMapStructure.root.summary,
      answer: mindMapStructure.root.summary || '',
      concepts: [],
      children: [],
      createdAt: Date.now(),
      isStreamed: false,
      isImported: true,
      sourceFile: combinedName,
      sourceDocumentId: documentIds.join(',')
    };

    const childNodes = (mindMapStructure.nodes || []).slice(0, 8);
    for (const nodeData of childNodes) {
      const nodeId = generateId();
      nodes[nodeId] = {
        id: nodeId,
        parentId: rootId,
        question: nodeData.title,
        summary: nodeData.summary,
        answer: nodeData.summary || '',
        concepts: [],
        children: [],
        createdAt: Date.now(),
        isStreamed: false,
        isImported: true,
        sourceFile: combinedName,
        sourceDocumentId: documentIds.join(',')
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

    // 5. 保存到 conversations
    const conversationId = await saveImportedConversation(combinedName, tree, req.user?.id);

    res.json({
      success: true,
      conversationId,
      tree,
      stats: {
        totalNodes: Object.keys(nodes).length,
        documentCount: selectedDocs.length,
        fileName: combinedName
      }
    });
  } catch (err) {
    console.error('Generate multi mind map error:', err);
    res.status(500).json({ success: false, error: err.message || '生成导图失败' });
  }
});

/**
 * 删除文档
 * DELETE /api/knowledge/documents/:documentId
 */
router.delete('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    await knowledgeBaseService.deleteDocument(documentId, req.user?.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 旧版文件列表（保留兼容）
 * GET /api/knowledge/files
 */
router.get('/files', (req, res) => {
  try {
    const files = knowledgeBaseService.listFiles(req.user?.id);
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 旧版删除文件（保留兼容）
 * DELETE /api/knowledge/files/:fileId
 */
router.delete('/files/:fileId', async (req, res) => {
  try {
    const result = await knowledgeBaseService.deleteFile(req.params.fileId, req.user?.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
