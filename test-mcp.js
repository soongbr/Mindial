/**
 * 测试 MCP 搜索功能
 */
const mcpSearchService = require('./services/mcpSearchService');

async function test() {
  console.log('=== 开始测试 MCP 搜索 ===\n');
  
  try {
    console.log('1. 初始化 MCP 客户端...');
    await mcpSearchService.initializeClient();
    console.log('✓ MCP 客户端初始化成功\n');
    
    console.log('2. 执行搜索测试...');
    const result = await mcpSearchService.webSearch('什么是人工智能');
    console.log('✓ 搜索完成\n');
    console.log('搜索结果:', JSON.stringify(result, null, 2).substring(0, 800));
    
    console.log('\n=== 测试成功 ===');
  } catch (err) {
    console.error('\n× 测试失败:', err.message);
    console.error(err.stack);
  } finally {
    await mcpSearchService.closeClient();
    setTimeout(() => process.exit(0), 1000);
  }
}

test();

// 超时处理
setTimeout(() => {
  console.log('\n超时，强制退出');
  mcpSearchService.closeClient();
  process.exit(1);
}, 120000);
