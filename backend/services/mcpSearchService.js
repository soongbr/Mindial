/**
 * MiniMax MCP Web Search Service
 * 使用 MiniMax Token Plan MCP 的 web_search 工具进行联网搜索
 * 
 * 使用 @modelcontextprotocol/sdk 官方 SDK 实现
 */
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';

// uvx 路径
const UVX_PATH = 'uvx';
// 指定使用 Python 3.12
const UV_PYTHON = 'C:\\Users\\64103\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

let mcpClient = null;
let isConnecting = false;
let connectionPromise = null;

/**
 * 初始化 MCP 客户端连接
 */
async function initializeClient() {
  if (mcpClient && mcpClient.connecting === false) {
    return mcpClient;
  }

  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  isConnecting = true;
  connectionPromise = (async () => {
    try {
      console.log('Starting MiniMax MCP client...');

      // 创建 STDIO 传输器，使用 Python 3.12
      const transport = new StdioClientTransport({
        command: UVX_PATH,
        args: ['minimax-coding-plan-mcp', '-y'],
        env: {
          ...process.env,
          MINIMAX_API_KEY,
          MINIMAX_API_HOST,
          UV_PYTHON,
        },
      });

      // 创建 MCP 客户端
      mcpClient = new Client({
        name: 'peiyangji-mcp-client',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      // 连接
      await mcpClient.connect(transport);
      console.log('MCP client connected successfully');

      isConnecting = false;
      return mcpClient;
    } catch (err) {
      console.error('Failed to initialize MCP client:', err);
      mcpClient = null;
      isConnecting = false;
      throw err;
    }
  })();

  return connectionPromise;
}

/**
 * 调用 web_search 工具进行搜索
 */
async function webSearch(query) {
  try {
    const client = await initializeClient();
    
    console.log('Calling web_search with query:', query);

    // 调用 web_search 工具
    const result = await client.callTool({
      name: 'web_search',
      arguments: { query },
    });

    console.log('web_search result:', JSON.stringify(result).substring(0, 500));
    return result;
  } catch (err) {
    console.error('MCP web_search error:', err);
    // 如果连接失败，清除客户端以便重试
    mcpClient = null;
    throw err;
  }
}

/**
 * 关闭 MCP 连接
 */
async function closeClient() {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch (err) {
      console.error('Error closing MCP client:', err);
    }
    mcpClient = null;
  }
}

module.exports = {
  webSearch,
  initializeClient,
  closeClient,
};
