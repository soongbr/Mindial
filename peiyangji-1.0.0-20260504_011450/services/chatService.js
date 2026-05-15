const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

// MiniMax API 配置 (Anthropic-compatible)
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com';

// 百炼/通义千问 API 配置
const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY;
const BAILIAN_BASE_URL = process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

// 是否使用百炼 (通义千问)
const USE_BAILIAN = process.env.USE_BAILIAN === 'true';

// 存储路径
const DATA_DIR = path.join(__dirname, '..', 'data');
const TREE_FILE = path.join(DATA_DIR, 'knowledge-tree.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 获取当前使用的模型ID
function getModelId() {
  return USE_BAILIAN ? 'qwen-max' : 'MiniMax-M2.7';
}

// 获取 API 配置
function getApiConfig() {
  if (USE_BAILIAN) {
    return {
      hostname: 'dashscope.aliyuncs.com',
      path: '/compatible-mode/v1/chat/completions',
      model: 'qwen-max',
    };
  } else {
    return {
      hostname: 'api.minimaxi.com',
      path: '/anthropic/v1/messages',
      model: 'MiniMax-M2.7',
    };
  }
}

/**
 * 调用 AI API 获取聊天回复
 */
async function getChatResponse(message, useMCP = false, detailLevel = 'short') {
  const apiConfig = getApiConfig();
  const maxTokens = detailLevel === 'short' ? 400 : 1000;
  
  const systemPrompt = `你是一个知识探索助手。请根据用户的问题，用中文回答。

要求：
1. 回答要准确、简洁
2. 提取3-5个关键概念，用中文逗号分隔
3. 在回答结束后，用"关键概念："开头列出这些概念

格式：
[你的回答]
关键概念：[概念1], [概念2], [概念3]`;

  const requestBody = {
    model: apiConfig.model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: `${systemPrompt}\n\n用户想知道：${message}`
      }
    ]
  };

  const data = JSON.stringify(requestBody);

  const options = {
    hostname: apiConfig.hostname,
    path: apiConfig.path,
    method: 'POST',
    headers: USE_BAILIAN ? {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'Content-Length': Buffer.byteLength(data)
    } : {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  console.log(`API request using ${USE_BAILIAN ? 'Bailian (qwen-max)' : 'MiniMax M2.7'}, maxTokens:`, maxTokens);

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log('API response status:', res.statusCode);
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log('API response body:', body.substring(0, 1500));
        try {
          if (!body || body.trim() === '') {
            reject(new Error('Empty response from API'));
            return;
          }
          const response = JSON.parse(body);
          if (response.error) {
            reject(new Error(response.error.message || 'API error'));
            return;
          }
          
          // 解析响应
          let text = '';
          let concepts = [];
          
          if (USE_BAILIAN) {
            // 百炼/OpenAI 格式
            text = response.choices?.[0]?.message?.content || '';
          } else {
            // M2.7 返回格式：content 数组包含 text 类型和 thinking 类型
            const textContent = response.content?.find(c => c.type === 'text');
            const thinkingContent = response.content?.find(c => c.type === 'thinking');
            text = textContent?.text || '';
            
            // 如果没有找到概念，尝试从 thinking 中提取
            if (thinkingContent?.text) {
              const thinkingText = thinkingContent.text;
              const conceptMatches = thinkingText.match(/[·•]\s*([^-\n]+)/g);
              if (conceptMatches) {
                concepts = conceptMatches.map(m => m.replace(/[·•]\s*/, '').trim()).slice(0, 5);
              }
            }
          }
          
          if (!text) {
            reject(new Error('No response content from API'));
            return;
          }
          
          // 解析回答和概念
          const conceptsMatch = text.match(/关键概念[：:]\s*([^\n]+)/i);
          if (conceptsMatch) {
            const conceptsStr = conceptsMatch[1];
            concepts = conceptsStr.split(/[,，]/).map(s => s.replace(/[\[\]]/g, '').trim()).filter(Boolean);
            text = text.split(/关键概念[：:]/i)[0].trim();
          }
          
          resolve({
            answer: text.trim(),
            concepts,
            streamedAnswer: text.trim(),
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (e) => {
      console.error('API request error:', e);
      reject(e);
    });
    
    req.write(data);
    req.end();
  });
}

/**
 * 流式调用 AI API
 * 使用 Server-Sent Events (SSE) 格式输出
 */
async function getChatResponseStream(message, detailLevel = 'short', res) {
  const apiConfig = getApiConfig();
  const maxTokens = detailLevel === 'short' ? 400 : 1000;
  
  // 检查 API 密钥
  if (USE_BAILIAN && !BAILIAN_API_KEY) {
    res.write('event: error\ndata: {"error":"BAILLIAN_API_KEY not configured"}\n\n');
    res.end();
    return;
  }
  if (!USE_BAILIAN && !MINIMAX_API_KEY) {
    res.write('event: error\ndata: {"error":"MINIMAX_API_KEY not configured"}\n\n');
    res.end();
    return;
  }
  
  const systemPrompt = `你是一个知识探索助手。请根据用户的问题，用中文回答。

要求：
1. 回答要准确、简洁
2. 提取3-5个关键概念，用中文逗号分隔
3. 在回答结束后，用"关键概念："开头列出这些概念

格式：
[你的回答]
关键概念：[概念1], [概念2], [概念3]

回答支持 Markdown 格式，可以使用 **粗体**、*斜体*、\`代码\`、列表等格式。`;

  let requestBody;
  let headers;
  
  if (USE_BAILIAN) {
    // 百炼/OpenAI 格式
    requestBody = {
      model: 'qwen-max',
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户想知道：${message}` }
      ]
    };
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
    };
  } else {
    // MiniMax M2.7 格式
    requestBody = {
      model: 'MiniMax-M2.7',
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: 'user', content: `${systemPrompt}\n\n用户想知道：${message}` }
      ]
    };
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
    };
  }

  const data = JSON.stringify(requestBody);

  const options = {
    hostname: apiConfig.hostname,
    path: apiConfig.path,
    method: 'POST',
    headers,
  };

  console.log(`Streaming API request using ${USE_BAILIAN ? 'Bailian (qwen-max)' : 'MiniMax M2.7'}, maxTokens:`, maxTokens);

  let fullText = '';
  let concepts = [];

  const req = https.request(options, (apiRes) => {
    console.log('Streaming API response status:', apiRes.statusCode);
    
    apiRes.on('data', (chunk) => {
      const text = chunk.toString();
      console.log('Stream chunk:', text.substring(0, 200));
      
      try {
        if (USE_BAILIAN) {
          // 百炼/OpenAI SSE 格式: data: {...}
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6).trim();
              if (jsonStr === '[DONE]' || !jsonStr) continue;
              
              const event = JSON.parse(jsonStr);
              // OpenAI 兼容格式
              if (event.choices?.[0]?.delta?.content) {
                const delta = event.choices[0].delta.content;
                fullText += delta;
                res.write('event: text\ndata: ' + JSON.stringify({ text: delta, fullText }) + '\n\n');
              }
            }
          }
        } else {
          // MiniMax M2.7 SSE 格式
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6);
              if (jsonStr === '[DONE]' || jsonStr === '') continue;
              
              const event = JSON.parse(jsonStr);
              
              if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta' && event.delta?.text) {
                  fullText += event.delta.text;
                  res.write('event: text\ndata: ' + JSON.stringify({ text: event.delta.text, fullText }) + '\n\n');
                }
              }
            }
          }
        }
      } catch (e) {
        // 如果不是 JSON 格式，直接发送原始文本
        if (text.trim()) {
          fullText += text;
          res.write('event: text\ndata: ' + JSON.stringify({ text: text, fullText }) + '\n\n');
        }
      }
    });
    
    apiRes.on('end', () => {
      console.log('Stream complete, fullText length:', fullText.length);
      
      // 解析关键概念
      const conceptsMatch = fullText.match(/关键概念[：:]\s*([^\n]+)/i);
      if (conceptsMatch) {
        const conceptsStr = conceptsMatch[1];
        concepts = conceptsStr.split(/[,，]/).map(s => s.replace(/[\[\]]/g, '').trim()).filter(Boolean);
      }
      
      res.write('event: done\ndata: ' + JSON.stringify({ concepts }) + '\n\n');
      res.end();
    });
  });

  req.on('error', (e) => {
    console.error('Streaming API request error:', e);
    res.write('event: error\ndata: ' + JSON.stringify({ error: e.message }) + '\n\n');
    res.end();
  });
  
  req.write(data);
  req.end();
}

/**
 * MCP联网搜索
 */
async function mcpSearch(query) {
  return {
    results: [
      { title: '相关结果1', snippet: `关于"${query}"的搜索结果...` },
      { title: '相关结果2', snippet: `更多信息...` },
    ],
    query,
    timestamp: Date.now(),
  };
}

/**
 * 保存知识树
 */
function saveTree(tree) {
  fs.writeFileSync(TREE_FILE, JSON.stringify(tree, null, 2));
}

/**
 * 加载知识树
 */
function loadTree() {
  if (fs.existsSync(TREE_FILE)) {
    return JSON.parse(fs.readFileSync(TREE_FILE, 'utf-8'));
  }
  return null;
}

module.exports = {
  getChatResponse,
  getChatResponseStream,
  mcpSearch,
  saveTree,
  loadTree,
};
