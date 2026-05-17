/**
 * MiniMax Embedding Service
 * 使用 MiniMax API 进行文本向量化
 * 包含 fallback：当 API 不可用时使用 TF-IDF 哈希生成伪向量
 */
const https = require('https');
const crypto = require('crypto');

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';

/**
 * 调用 MiniMax Embedding API 获取文本向量
 * MiniMax API 格式: POST /v1/embeddings
 * Request: { model: 'emb-text-01', texts: [text], type: 'query'|'document' }
 * Response: { vectors: [[...]], base_resp: { status_code: 0 } }
 * @param {string} text - 要向量化的文本
 * @param {string} textType - 文本类型 'query' | 'document'
 * @returns {Promise<number[]>} - 向量数组
 */
async function embedText(text, textType = 'query') {
  return new Promise((resolve, reject) => {
    const requestBody = {
      model: 'emb-text-01',
      texts: [text],
      type: textType
    };

    const data = JSON.stringify(requestBody);

    const options = {
      hostname: 'api.minimaxi.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    console.log('Embedding request for text:', text.substring(0, 50));

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        clearTimeout(timeoutId);
        try {
          const response = JSON.parse(body);
          console.log('Embedding response status:', res.statusCode, 'base_resp:', response.base_resp?.status_code);
          
          // MiniMax 返回的错误格式
          if (response.base_resp && response.base_resp.status_code !== 0) {
            reject(new Error(response.base_resp.status_msg || 'Embedding API error'));
            return;
          }

          // MiniMax API 返回格式: { vectors: [[...]] }
          if (response.vectors && Array.isArray(response.vectors) && response.vectors.length > 0) {
            resolve(response.vectors[0]);
          } else if (response.data && response.data[0] && response.data[0].embedding) {
            // 兼容 OpenAI 格式
            resolve(response.data[0].embedding);
          } else {
            reject(new Error('Invalid embedding response format: ' + JSON.stringify(response).substring(0, 200)));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    // 设置超时（10秒），防止 API 无响应导致请求挂死
    const timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error('Embedding API request timeout (10s)'));
    }, 10000);

    req.on('error', (e) => {
      clearTimeout(timeoutId);
      console.error('Embedding request error:', e);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Fallback: 使用字符级 n-gram 哈希生成伪向量（当 API 不可用时）
 * 相比词级哈希，字符 n-gram 对中文文本效果更好
 * @param {string} text
 * @param {number} dim - 向量维度
 * @returns {number[]}
 */
function generateFallbackEmbedding(text, dim = 1024) {
  // 提取字符级 2-gram 和 3-gram（对中文更友好）
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  const ngrams = [];
  
  // 2-gram
  for (let i = 0; i < normalized.length - 1; i++) {
    ngrams.push(normalized.substring(i, i + 2));
  }
  // 3-gram
  for (let i = 0; i < normalized.length - 2; i++) {
    ngrams.push(normalized.substring(i, i + 3));
  }
  // word-level for English
  const words = text.toLowerCase().split(/[\s\p{P}]+/u).filter(w => w.length > 1);
  ngrams.push(...words);
  
  const vector = new Array(dim).fill(0);
  
  for (let i = 0; i < ngrams.length; i++) {
    const hash = crypto.createHash('sha256').update(ngrams[i]).digest();
    // 将 hash 的每个字节映射到不同的维度位置
    for (let j = 0; j < hash.length; j++) {
      const dimIdx = (hash[j] * 2654435761) % dim; // 使用 Knuth 乘法哈希分散到维度空间
      const sign = (hash[j] & 1) ? 1 : -1;
      vector[dimIdx] += sign;
    }
  }
  
  // L2 归一化
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map(v => norm > 0 ? v / norm : 0);
}

/**
 * 批量向量化文本（带 fallback）
 * @param {string[]} texts - 要向量化的文本数组
 * @param {boolean} useFallback - 是否使用 fallback
 * @returns {Promise<number[][]>} - 向量数组
 */
async function embedTexts(texts, useFallback = false) {
  const results = [];
  for (const text of texts) {
    try {
      const embedding = useFallback 
        ? generateFallbackEmbedding(text) 
        : await embedText(text);
      results.push(embedding);
    } catch (err) {
      console.error('Failed to embed text:', text.substring(0, 30), err.message);
      // 出错时使用 fallback
      results.push(generateFallbackEmbedding(text));
    }
  }
  return results;
}

/**
 * 计算余弦相似度
 * @param {number[]} vec1
 * @param {number[]} vec2
 * @returns {number}
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

module.exports = {
  embedText,
  embedTexts,
  generateFallbackEmbedding,
  cosineSimilarity
};
