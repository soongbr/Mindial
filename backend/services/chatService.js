const fs = require('fs');
const path = require('path');
const https = require('https');

// MiniMax MCP Search Service
const mcpSearchService = require('./mcpSearchService');
// Knowledge Base Service
const knowledgeBaseService = require('./knowledgeBaseService');

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

// 获取当前使用的模型 ID
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
async function getChatResponse(message, detailLevel = 'short', searchResults = null) {
  const apiConfig = getApiConfig();
  const maxTokens = detailLevel === 'short' ? 8000 : 32000;
  const detailInstruction = detailLevel === 'short'
    ? '回答要准确，根据问题复杂度自行判断回答长度：简单问题简短回答，复杂问题充分展开'
    : '回答要详细、深入、全面，充分展开每个要点，提供具体例子和细节说明。不要因为篇幅限制而截断回答。';
  
  let systemPromptExtra = '';
  if (searchResults) {
    systemPromptExtra = `\n\n## 联网搜索结果\n以下是从网络搜索获取的最新信息，请在回答时引用：\n${searchResults}\n\n请在回答时用上标数字标注引用来源，例如：[1]、[2]。`;
  }
  
  const systemPrompt = `你是一个知识探索助手。请根据用户的问题，用中文回答。

要求：
1. ${detailInstruction}
2. 提取 3-5 个关键概念，用中文逗号分隔
3. 在回答结束后，用"关键概念："开头列出这些概念${searchResults ? '\n4. 如果使用了搜索结果中的信息，请用上标数字标注引用来源，例如：[1]、[2]' : ''}

格式：
[你的回答]${searchResults ? '\n[引用来源，如果有的话]' : ''}
关键概念：[概念 1], [概念 2], [概念 3]` + systemPromptExtra;

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
            // M2.7 返回格式：content 数组包含 text、thinking、tool_use 类型
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
          const conceptsMatch = text.match(/关键概念 [：:]\s*([^\n]+)/i);
          if (conceptsMatch) {
            const conceptsStr = conceptsMatch[1];
            concepts = conceptsStr.split(/[,，]/).map(s => s.replace(/[\[\]]/g, '').trim()).filter(Boolean);
            text = text.split(/关键概念 [：:]/i)[0].trim();
          }
          
          resolve({
            answer: text.trim(),
            concepts,
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
 * @param {string} message - 用户消息
 * @param {string} detailLevel - 回答详细程度
 * @param {object} res - Express 响应对象
 * @param {boolean} enableSearch - 是否启用联网搜索（默认true）
 * @param {boolean} enableKnowledgeBase - 是否启用知识库检索（默认true）
 * @param {Array<string>} knowledgeBaseDocumentIds - 可选，限定参考的文档 ID 列表
 */
async function getChatResponseStream(message, detailLevel = 'short', res, enableSearch = true, enableKnowledgeBase = true, knowledgeBaseDocumentIds = null) {
  const apiConfig = getApiConfig();
  const maxTokens = detailLevel === 'short' ? 16000 : 64000;
  
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
  
  // 执行联网搜索
  let searchResults = null;
  let searchResultsText = null;
  // 搜索结果结构（供前端展示）
  let searchResultsStructured = null;
  if (enableSearch && !USE_BAILIAN) {
    try {
      res.write('event: search_start\ndata: {"status":"searching"}\n\n');
      const searchResult = await mcpSearchService.webSearch(message);
      
      // 解析搜索结果 - 确保搜索完成后总是发送 search_done 事件
      if (searchResult && searchResult.content) {
        const textContent = searchResult.content.find(c => c.type === 'text');
        if (textContent && textContent.text) {
          // 尝试解析 JSON 格式（MiniMax MCP 返回的格式）
          try {
            const parsed = JSON.parse(textContent.text);
            if (parsed.organic && Array.isArray(parsed.organic)) {
              // 构建结构化搜索结果，包含标题、链接、摘要
              searchResultsStructured = parsed.organic.map(item => ({
                title: item.title || '',
                link: item.link || '',
                snippet: item.snippet || ''
              }));
              searchResultsText = textContent.text; // 保留原始文本供 AI 使用
            } else {
              searchResultsText = textContent.text;
            }
          } catch (parseErr) {
            // 不是 JSON 格式，当作纯文本处理
            searchResultsText = textContent.text;
          }
        }
      }
      // 即使没有搜索结果，也发送 search_done 事件让前端知道搜索已结束
      res.write('event: search_done\ndata: ' + JSON.stringify({ 
        results: searchResultsText, 
        structured: searchResultsStructured 
      }) + '\n\n');
    } catch (err) {
      console.error('Web search error:', err);
      res.write('event: search_error\ndata: {"error":"' + err.message + '"}\n\n');
    }
  }
  
  // 执行知识库检索（RAG）
  let kbResults = null;
  let kbDone = false;  // 标记 KB 是否完成（即使失败也算完成）
  if (enableKnowledgeBase) {
    try {
      res.write('event: kb_start\ndata: {"status":"searching"}\n\n');
      kbResults = await knowledgeBaseService.searchKnowledge(message, {
        topK: 3,
        documentIds: knowledgeBaseDocumentIds
      });
      kbDone = true;
      res.write('event: kb_done\ndata: ' + JSON.stringify({ results: kbResults }) + '\n\n');
    } catch (err) {
      console.error('Knowledge base search error:', err);
      kbDone = true;  // 标记完成，让前端可以继续
      // 不发送 kb_error，避免中断流程；改为发送 kb_done 并标记 results 为空
      res.write('event: kb_done\ndata: ' + JSON.stringify({ results: [], error: err.message }) + '\n\n');
    }
  }
  
  let systemPromptExtra = '';
  if (searchResultsText) {
    systemPromptExtra += `\n\n## 联网搜索结果\n以下是从网络搜索获取的最新信息，请在回答时引用：\n${searchResultsText}\n\n引用规则：使用网络搜索结果时，在相关内容后标注 [1]、[2] 等。`;
  }
  
  // 知识库结果（使用 KB- 前缀避免与搜索结果索引冲突）
  if (kbResults && kbResults.length > 0) {
    const kbText = kbResults.map((r, i) => `[KB-${i + 1}] ${r.content}`).join('\n');
    systemPromptExtra += `\n\n## 知识库检索结果\n以下是从你的知识库中检索到的相关内容，请结合这些内容回答用户的问题：\n${kbText}\n\n引用规则（重要！）：\n- 使用知识库内容时，必须在相关内容后用 [KB-1]、[KB-2] 标注来源\n- 使用网络搜索结果时，用 [1]、[2] 标注\n- 两种来源必须用不同的编号格式区分！\n- 如果你的回答完全没有参考知识库内容，不用标注 KB 引用`;
  }
  
  const detailInstruction = detailLevel === 'short'
    ? '回答要准确、简洁，抓住核心要点'
    : '回答要详细、深入、全面，充分展开每个要点，提供具体例子和细节说明';

  const systemPrompt = `你是一个知识探索助手。请根据用户的问题，用中文回答。

要求：
1. ${detailInstruction}
2. 提取 3-5 个关键概念，用中文逗号分隔
3. 在回答结束后，用"关键概念："开头列出这些概念${searchResultsText ? '\n4. 如果使用了搜索结果中的信息，请用上标数字标注引用来源，例如：[1]、[2]' : ''}

格式：
[你的回答]${searchResultsText ? '\n[引用来源，如果有的话]' : ''}
关键概念：[概念 1], [概念 2], [概念 3]` + systemPromptExtra;

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
    
    // 客户端断开连接时，中止上游 API 请求，避免资源浪费
    res.on('close', () => {
      console.log('Client disconnected, aborting upstream API request');
      req.destroy();
    });
    
    apiRes.on('data', (chunk) => {
      const text = chunk.toString();
      console.log('Stream chunk:', text.substring(0, 200));
      
      try {
        if (USE_BAILIAN) {
          // 百炼/OpenAI SSE 格式：data: {...}
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
      const conceptsMatch = fullText.match(/关键概念 [：:]\s*([^\n]+)/i);
      if (conceptsMatch) {
        const conceptsStr = conceptsMatch[1];
        concepts = conceptsStr.split(/[,，]/).map(s => s.replace(/[\[\]]/g, '').trim()).filter(Boolean);
      }

      // 构建引用来源数据
      const references = { web: [], kb: [] };

      // 提取答案中实际引用的网络搜索编号
      if (searchResultsStructured && searchResultsStructured.length > 0) {
        const webRefNums = new Set();
        const webRefPattern = /(?<!KB-)\[(\d+)\]/g;
        let match;
        while ((match = webRefPattern.exec(fullText)) !== null) {
          webRefNums.add(parseInt(match[1]));
        }
        webRefNums.forEach(num => {
          if (num >= 1 && num <= searchResultsStructured.length) {
            references.web.push(searchResultsStructured[num - 1]);
          }
        });
      }

      // 提取答案中实际引用的知识库编号
      if (kbResults && kbResults.length > 0) {
        const kbRefNums = new Set();
        const kbRefPattern = /\[KB-(\d+)\]/gi;
        let match;
        while ((match = kbRefPattern.exec(fullText)) !== null) {
          kbRefNums.add(parseInt(match[1]));
        }
        kbRefNums.forEach(num => {
          if (num >= 1 && num <= kbResults.length) {
            references.kb.push(kbResults[num - 1]);
          }
        });
      }

      // 如果没解析到具体引用但有搜索结果，全部纳入
      if (references.web.length === 0 && searchResultsStructured && searchResultsStructured.length > 0) {
        references.web = searchResultsStructured.slice(0, 5);
      }
      if (references.kb.length === 0 && kbResults && kbResults.length > 0) {
        references.kb = kbResults.slice(0, 5);
      }
      
      res.write('event: done\ndata: ' + JSON.stringify({ concepts, references }) + '\n\n');
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
  saveTree,
  loadTree,
};
