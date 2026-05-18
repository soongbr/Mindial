/**
 * Document Parser Service
 * 支持 PDF、Word、TXT、Markdown 文件解析
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// PDF 解析
const pdfParse = require('pdf-parse');
// Word 解析
const mammoth = require('mammoth');

// PDF 解析动态加载（pdf-parse 1.x 直接是函数，2.x 是 ESM）
let _pdfParse = null;
async function getPdfParse() {
  if (!_pdfParse) {
    // 尝试 ESM 导入
    try {
      const m = await import('pdf-parse');
      _pdfParse = m.default || m;
    } catch {
      // 回退到 CJS
      _pdfParse = require('pdf-parse');
    }
  }
  return _pdfParse;
}

/**
 * 调用 AI API 分析文档并生成思维导图结构
 * @param {string} content - 文档内容
 * @param {string} fileName - 文件名
 * @param {Object} apiConfig - API 配置 { hostname, path, model, apiKey }
 * @returns {Promise<{root: {title: string, summary: string}, nodes: Array<{title: string, summary: string}>}>}
 */
async function analyzeAndGenerateMindMap(content, fileName, apiConfig) {
  const { hostname, path: apiPath, model, apiKey } = apiConfig;

  const systemPrompt = `你是一个文档分析专家。请分析用户上传的文档，生成一个思维导图结构。

要求：
1. 分析文档的核心主题和主要内容
2. 生成一个根节点（文档主题）
3. 生成 5-10 个子节点（主要章节或核心概念）
4. 每个节点包含标题和简要说明

请以 JSON 格式返回，格式如下：
{
  "root": {
    "title": "文档主题",
    "summary": "文档的简要说明"
  },
  "nodes": [
    {
      "title": "子节点标题1",
      "summary": "该部分的简要说明"
    },
    {
      "title": "子节点标题2", 
      "summary": "该部分的简要说明"
    }
  ]
}

请直接返回 JSON，不要包含其他文字。`;

  const truncatedContent = content.length > 8000 ? content.substring(0, 8000) + '...' : content;

  const requestBody = {
    model: model,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `${systemPrompt}\n\n请分析以下文档内容：\n\n${truncatedContent}`
      }
    ]
  };

  const data = JSON.stringify(requestBody);

  const options = {
    hostname: hostname,
    path: apiPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        try {
          if (!body || body.trim() === '') {
            reject(new Error('Empty response from AI API'));
            return;
          }

          console.log('AI API response for mind map:', body.substring(0, 500));

          const response = JSON.parse(body);

          // 尝试从响应中提取 JSON
          let text = '';
          if (response.content) {
            // M2.7 格式
            const textContent = response.content.find(c => c.type === 'text');
            text = textContent?.text || '';
          } else if (response.choices?.[0]?.message?.content) {
            // OpenAI/百炼 格式
            text = response.choices[0].message.content;
          }

          if (!text) {
            reject(new Error('No text content from AI API'));
            return;
          }

          // 提取 JSON（可能是代码块或纯 JSON）
          let jsonStr = text.trim();
          const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1];
          }

          const result = JSON.parse(jsonStr);

          // 验证返回格式
          if (!result.root || !result.root.title) {
            // 如果格式不对，尝试用默认结构
            console.log('Invalid mind map format, using default');
            result.root = result.root || { title: fileName, summary: '文档内容' };
            result.nodes = result.nodes || [];
          }

          resolve(result);
        } catch (err) {
          console.error('Failed to parse mind map response:', err);
          // 返回默认结构，避免完全失败
          resolve({
            root: { title: fileName, summary: '文档内容摘要' },
            nodes: []
          });
        }
      });
    });

    req.on('error', (e) => {
      console.error('AI API request error:', e);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

/**
 * 解析文档内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} - 解析后的纯文本内容
 */
async function parseDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return await parsePDF(filePath);
    case '.docx':
    case '.doc':
      return await parseWord(filePath);
    case '.txt':
    case '.md':
    case '.markdown':
      return await parseText(filePath);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfParseFn = await getPdfParse();
  const data = await pdfParseFn(dataBuffer);
  return data.text;
}

/**
 * 解析 Word 文件
 */
async function parseWord(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

/**
 * 解析纯文本文件
 */
async function parseText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 文本切片（滑动窗口）
 * @param {string} text - 原始文本
 * @param {Object} options - 切片配置
 * @returns {Array<{content: string, startIndex: number, endIndex: number}>}
 */
function splitIntoChunks(text, options = {}) {
  const {
    chunkSize = 500,      // 每段字数
    chunkOverlap = 50,    // 重叠字数
    splitBySentence = true // 按句子分割
  } = options;

  if (!splitBySentence) {
    // 简单按字数分割
    return simpleChunkSplit(text, chunkSize, chunkOverlap);
  }

  // 按句子分割（中文）
  const sentences = splitIntoSentences(text);
  
  const chunks = [];
  let currentChunk = '';
  let currentIndex = 0;
  let startIndex = 0;

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize) {
      // 保存当前 chunk
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          startIndex,
          endIndex: currentIndex
        });
      }
      // 滑窗：保留 overlap 部分
      const overlapText = currentChunk.slice(-chunkOverlap);
      startIndex = currentIndex - overlapText.length;
      currentChunk = overlapText + sentence;
    } else {
      currentChunk += sentence;
    }
    currentIndex += sentence.length;
  }

  // 最后一个 chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      startIndex,
      endIndex: text.length
    });
  }

  return chunks;
}

/**
 * 简单按字数分割
 */
function simpleChunkSplit(text, chunkSize, chunkOverlap) {
  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const content = text.slice(startIndex, endIndex).trim();
    
    if (content) {
      chunks.push({
        content,
        startIndex,
        endIndex
      });
    }

    startIndex += chunkSize - chunkOverlap;
    if (startIndex < 0) startIndex = 0;
  }

  return chunks;
}

/**
 * 将文本分割成句子（中文为主）
 */
function splitIntoSentences(text) {
  // 简单按句号、问号、感叹号分割
  const sentences = text.split(/(?<=[。！？；\n])/);
  return sentences.filter(s => s.trim().length > 0);
}

module.exports = {
  parseDocument,
  splitIntoChunks,
  splitIntoSentences,
  analyzeAndGenerateMindMap
};
