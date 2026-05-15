const mcp = require('./services/mcpSearchService');

console.log('Testing search via MiniMax API...');
mcp.webSearch('什么是人工智能')
  .then(result => {
    console.log('Search result:', JSON.stringify(result).substring(0, 800));
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });

// Timeout after 20 seconds
setTimeout(() => {
  console.log('Timeout reached');
  process.exit(1);
}, 20000);
