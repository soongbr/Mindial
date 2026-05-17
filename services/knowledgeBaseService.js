/**
 * Knowledge Base Service
 * 知识库管理 + RAG 检索增强
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { parseDocument, splitIntoChunks } = require('./documentParser');
const { embedText, cosineSimilarity, generateFallbackEmbedding } = require('./embeddingService');
const { fixFileNameEncoding } = require('../utils/filename');

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'peiyangji_knowledge';

// 数据存储路径
const DATA_DIR = path.join(__dirname, '..', 'data');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const FILES_DB = path.join(KNOWLEDGE_DIR, 'files.json');

// 确保目录存在
if (!fs.existsSync(KNOWLEDGE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

// 向量维度（emb-text-01 输出 1024 维）
const EMBEDDING_DIM = 1024;

// Qdrant 客户端
let qdrantClient = null;
let isCollectionReady = false;

function getQdrantClient() {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({ url: QDRANT_URL });
  }
  return qdrantClient;
}

/**
 * 初始化知识库（创建 collection）
 */
async function initializeKnowledgeBase() {
  const client = getQdrantClient();
  
  try {
    // 检查 collection 是否存在
    const collections = await client.getCollections();
    const collectionExists = collections.collections?.some(c => c.name === COLLECTION_NAME);
    
    if (!collectionExists) {
      console.log('Creating Qdrant collection:', COLLECTION_NAME);
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: EMBEDDING_DIM,
          distance: 'Cosine'
        }
      });
      console.log('Collection created successfully');
    }
    
    isCollectionReady = true;
    console.log('Knowledge base initialized');
  } catch (err) {
    console.error('Failed to initialize knowledge base:', err);
    throw err;
  }
}

/**
 * 获取文件数据库
 */
function getFilesDb() {
  if (fs.existsSync(FILES_DB)) {
    return JSON.parse(fs.readFileSync(FILES_DB, 'utf-8'));
  }
  return {
    files: [],      // 文件列表
    chunks: {}      // chunk 信息（fileId -> chunks）
  };
}

/**
 * 保存文件数据库
 */
function saveFilesDb(db) {
  fs.writeFileSync(FILES_DB, JSON.stringify(db, null, 2));
}

/**
 * 上传并解析文档
 * @param {Object} file - multer 上传的文件对象
 * @returns {Promise<Object>} - 文件信息
 */
async function uploadDocument(file, userId) {
  // 确保知识库已初始化
  if (!isCollectionReady) {
    await initializeKnowledgeBase();
  }

  const fileId = generateId();
  const filePath = file.path;
  // 使用公共工具修复文件名编码
  const fileName = fixFileNameEncoding(file.originalname);
  const fileExt = path.extname(fileName).toLowerCase();
  const fileSize = file.size;

  console.log('Processing document:', fileName);

  try {
    // 1. 解析文档
    const text = await parseDocument(filePath);
    console.log('Document parsed, length:', text.length);

    // 2. 切片
    const chunks = splitIntoChunks(text, { chunkSize: 500, chunkOverlap: 50 });
    console.log('Document split into', chunks.length, 'chunks');

    // 3. 向量化并存入 Qdrant
    const client = getQdrantClient();
    const points = [];
    const chunkInfos = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        console.log(`Embedding chunk ${i + 1}/${chunks.length}...`);
        // 优先使用 API，失败时使用 fallback
        let embedding;
        try {
          embedding = await embedText(chunk.content, 'document');
        } catch (err) {
          console.log('Using fallback embedding for chunk', i);
          const { generateFallbackEmbedding } = require('./embeddingService');
          embedding = generateFallbackEmbedding(chunk.content, EMBEDDING_DIM);
        }
        
        const pointId = generateId();
        points.push({
          id: pointId,
          vector: embedding,
          payload: {
            fileId,
            fileName,
            chunkIndex: i,
            content: chunk.content,
            startIndex: chunk.startIndex,
            endIndex: chunk.endIndex
          }
        });

        chunkInfos.push({
          pointId,
          chunkIndex: i,
          content: chunk.content.substring(0, 100) + '...'
        });

        // 批量插入（每 10 条）
        if (points.length >= 10) {
          await client.upsert(COLLECTION_NAME, { points });
          console.log('Inserted', points.length, 'points');
          points.length = 0;  // 清空
        }
      } catch (err) {
        console.error('Failed to embed chunk', i, err.message);
      }
    }

    // 插入剩余的 points
    if (points.length > 0) {
      await client.upsert(COLLECTION_NAME, { points });
      console.log('Inserted final', points.length, 'points');
    }

    // 4. 更新文件数据库
    const db = getFilesDb();
    const fileInfo = {
      id: fileId,
      name: fileName,
      size: fileSize,
      type: fileExt,
      status: 'ready',  // ready | parsing | failed
      uploadedAt: Date.now(),
      chunkCount: chunks.length,
      chunks: chunkInfos
    };
    
    // 记录上传用户
    if (userId) fileInfo.userId = userId;
    
    db.files.push(fileInfo);
    saveFilesDb(db);

    // 5. 临时文件由调用方（路由层）负责清理，这里不删除
    // 这样可以避免双重删除的问题

    console.log('Document uploaded successfully:', fileName, 'user:', userId);
    return fileInfo;

  } catch (err) {
    console.error('Failed to upload document:', err);
    
    // 更新文件状态为失败
    const db = getFilesDb();
    db.files.push({
      id: fileId,
      name: fileName,
      status: 'failed',
      error: err.message,
      uploadedAt: Date.now()
    });
    saveFilesDb(db);
    
    throw err;
  }
}

/**
 * 搜索知识库
 * @param {string} query - 查询文本
 * @param {Object} options - 搜索选项
 * @param {Array<string>} options.documentIds - 可选，限定搜索的文档 ID 列表
 * @returns {Promise<Array>} - 搜索结果
 */
async function searchKnowledge(query, options = {}) {
  const {
    topK = 5,
    minSimilarity = 0.5,
    documentIds = null  // 可选，限定搜索的文档
  } = options;

  console.log('Searching knowledge base for:', query, 'documentIds:', documentIds);

  try {
    // 1. 向量化查询（优先 API，失败用 fallback）
    let queryEmbedding;
    try {
      queryEmbedding = await embedText(query, 'query');
    } catch (err) {
      console.log('Using fallback embedding for query');
      queryEmbedding = generateFallbackEmbedding(query, EMBEDDING_DIM);
    }
    
    // 2. 在 Qdrant 中搜索
    const client = getQdrantClient();
    
    if (!isCollectionReady) {
      await initializeKnowledgeBase();
    }

    // 构建搜索选项
    const searchOptions = {
      vector: queryEmbedding,
      limit: topK,
      score_threshold: minSimilarity
    };

    // 如果指定了文档 ID 列表，添加过滤器
    if (documentIds && documentIds.length > 0) {
      searchOptions.filter = {
        must: [
          { key: 'fileId', match: { any: documentIds } }
        ]
      };
    }

    const results = await client.search(COLLECTION_NAME, searchOptions);

    console.log('Search found', results.length, 'results');

    // 3. 格式化结果
    return results.map(r => ({
      content: r.payload.content,
      score: r.score,
      fileId: r.payload.fileId,
      fileName: r.payload.fileName,
      chunkIndex: r.payload.chunkIndex,
      source: `[来源: ${r.payload.fileName}, 段落${r.payload.chunkIndex + 1}]`
    }));

  } catch (err) {
    console.error('Search failed:', err);
    throw err;
  }
}

/**
 * 获取知识库文件列表
 */
function listFiles(userId) {
  const db = getFilesDb();
  let files = db.files;
  if (userId) files = files.filter(f => !f.userId || f.userId === userId);
  return files.map(f => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    status: f.status,
    uploadedAt: f.uploadedAt,
    chunkCount: f.chunkCount,
    hasMindMap: f.hasMindMap || false,
    conversationId: f.conversationId || null
  }));
}

/**
 * 获取文档列表（带导图状态）
 * 新版本 API，统一返回格式
 */
function listDocuments(userId) {
  const db = getFilesDb();
  let files = db.files;
  if (userId) files = files.filter(f => !f.userId || f.userId === userId);
  return files.map(f => ({
    id: f.id,
    fileName: f.name,
    fileSize: f.size,
    fileType: f.type,
    status: f.status,
    uploadedAt: f.uploadedAt,
    hasMindMap: f.hasMindMap || false,
    conversationId: f.conversationId || null,
    chunkCount: f.chunkCount || 0
  }));
}

/**
 * 添加本地文件记录（Qdrant 上传失败时使用）
 * @param {string} fileName - 文件名
 * @param {number} fileSize - 文件大小
 * @param {string} filePath - 临时文件路径（可选，用于读取内容）
 * @param {string} content - 解析后的文档内容（可选，优先使用）
 */
function addLocalFile(fileName, fileSize, filePath, content, userId) {
  const db = getFilesDb();
  const fileId = generateId();
  
  // 保存文档内容到本地
  let savedContent = content || '';
  if (!savedContent && filePath && fs.existsSync(filePath)) {
    try {
      savedContent = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn('Cannot read local file content:', e.message);
    }
  }
  
  if (savedContent) {
    const contentDir = path.join(KNOWLEDGE_DIR, 'content');
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }
    const contentFile = path.join(contentDir, `${fileId}.txt`);
    fs.writeFileSync(contentFile, savedContent, 'utf-8');
    console.log('Local content saved:', contentFile, 'length:', savedContent.length);
  }
  
  const fileInfo = {
    id: fileId,
    name: fileName,
    size: fileSize,
    type: path.extname(fileName).toLowerCase(),
    status: 'ready',
    uploadedAt: Date.now(),
    hasMindMap: false,
    conversationId: null,
    chunks: [],
    isLocal: true,  // 标记为本地模式（未接入 Qdrant）
    hasLocalContent: !!savedContent
  };
  
  if (userId) fileInfo.userId = userId;
  
  db.files.push(fileInfo);
  saveFilesDb(db);
  
  return fileInfo;
}

/**
 * 获取文档内容（从 Qdrant 重建，或从本地文件读取）
 */
async function getDocumentContent(fileId, userId) {
  const db = getFilesDb();
  const file = db.files.find(f => f.id === fileId);
  
  if (!file) {
    throw new Error('Document not found');
  }
  
  // 权限校验：只允许文档所有者访问
  if (userId && file.userId && file.userId !== userId) {
    throw new Error('无权访问该文档');
  }
  
  // 本地模式：从本地内容文件读取
  if (file.isLocal) {
    const contentDir = path.join(KNOWLEDGE_DIR, 'content');
    const contentFile = path.join(contentDir, `${fileId}.txt`);
    
    // 如果有本地存储内容，直接读取
    if (fs.existsSync(contentFile)) {
      const content = fs.readFileSync(contentFile, 'utf-8');
      console.log('Read local content, length:', content.length);
      return content;
    }
    
    throw new Error('Document stored locally, no content available - please re-upload');
  }
  
  const client = getQdrantClient();
  
  // 从 Qdrant 获取该文件的所有 chunks
  try {
    const results = await client.scroll(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'fileId', match: { value: fileId } }
        ]
      },
      limit: 1000
    });
    
    if (!results.points || results.points.length === 0) {
      throw new Error('No content found in vector database');
    }
    
    // 按 chunkIndex 排序并拼接内容
    const chunks = results.points
      .map(p => ({ index: p.payload.chunkIndex, content: p.payload.content }))
      .sort((a, b) => a.index - b.index)
      .map(c => c.content);
    
    return chunks.join('\n');
  } catch (err) {
    console.error('Failed to get document content from Qdrant:', err);
    throw err;
  }
}

/**
 * 获取文档关联的对话
 */
function getDocumentConversation(documentId) {
  const db = getFilesDb();
  const file = db.files.find(f => f.id === documentId);
  
  if (!file || !file.conversationId) {
    return null;
  }
  
  // 从 conversations.json 读取对话
  const conversationsFile = path.join(__dirname, '..', 'data', 'conversations.json');
  if (!fs.existsSync(conversationsFile)) {
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(conversationsFile, 'utf-8'));
    return data.conversations.find(c => c.id === file.conversationId);
  } catch (e) {
    console.error('Failed to get document conversation:', e);
    return null;
  }
}

/**
 * 标记文档已生成导图
 */
function markDocumentAsProcessed(documentId, conversationId) {
  const db = getFilesDb();
  const file = db.files.find(f => f.id === documentId);
  
  if (file) {
    file.hasMindMap = true;
    file.conversationId = conversationId;
    saveFilesDb(db);
  }
}

/**
 * 删除文档（包含 Qdrant 数据和对话）
 */
async function deleteDocument(documentId, userId) {
  const db = getFilesDb();
  const file = db.files.find(f => f.id === documentId);
  
  if (!file) {
    throw new Error('Document not found');
  }
  
  // 权限校验：只允许文档所有者删除
  if (userId && file.userId && file.userId !== userId) {
    throw new Error('无权删除该文档');
  }
  
  // 1. 从 Qdrant 删除关联的 points
  if (!file.isLocal && file.chunks && file.chunks.length > 0) {
    try {
      const client = getQdrantClient();
      const pointsToDelete = file.chunks.map(c => c.pointId);
      await client.delete(COLLECTION_NAME, { points: pointsToDelete });
    } catch (err) {
      console.error('Failed to delete points from Qdrant:', err);
    }
  }
  
  // 2. 从 conversations.json 删除关联的对话
  if (file.conversationId) {
    const conversationsFile = path.join(__dirname, '..', 'data', 'conversations.json');
    if (fs.existsSync(conversationsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(conversationsFile, 'utf-8'));
        data.conversations = data.conversations.filter(c => c.id !== file.conversationId);
        if (data.currentConversationId === file.conversationId) {
          data.currentConversationId = null;
        }
        fs.writeFileSync(conversationsFile, JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('Failed to delete conversation:', e);
      }
    }
  }
  
  // 3. 清理本地内容文件
  const contentDir = path.join(KNOWLEDGE_DIR, 'content');
  const contentFile = path.join(contentDir, `${documentId}.txt`);
  if (fs.existsSync(contentFile)) {
    try {
      fs.unlinkSync(contentFile);
      console.log('Deleted local content file:', contentFile);
    } catch (e) {
      console.warn('Failed to delete local content file:', e.message);
    }
  }

  // 4. 从数据库删除文件记录
  db.files = db.files.filter(f => f.id !== documentId);
  saveFilesDb(db);
  
  return { success: true };
}

/**
 * 删除文件及其关联的 chunks
 */
async function deleteFile(fileId, userId) {
  const client = getQdrantClient();
  const db = getFilesDb();
  
  const file = db.files.find(f => f.id === fileId);
  if (!file) {
    throw new Error('File not found');
  }
  
  // 权限校验：只允许文件所有者删除
  if (userId && file.userId && file.userId !== userId) {
    throw new Error('无权删除该文件');
  }

  // 从 Qdrant 中删除关联的 points
  const pointsToDelete = file.chunks?.map(c => c.pointId) || [];
  if (pointsToDelete.length > 0) {
    try {
      await client.delete(COLLECTION_NAME, {
        points: pointsToDelete
      });
    } catch (err) {
      console.error('Failed to delete points from Qdrant:', err);
    }
  }

  // 从数据库中删除
  db.files = db.files.filter(f => f.id !== fileId);
  saveFilesDb(db);

  return { success: true };
}

/**
 * 生成唯一 ID (UUID v4 格式)
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  initializeKnowledgeBase,
  uploadDocument,
  searchKnowledge,
  listFiles,
  listDocuments,
  addLocalFile,
  getDocumentContent,
  getDocumentConversation,
  markDocumentAsProcessed,
  deleteDocument,
  deleteFile,
  isCollectionReady: () => isCollectionReady
};
