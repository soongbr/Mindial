const https = require('https');

const API_KEY = 'sk-cp-DeMH6XqW6Yp1TXOHvuSn31Elps5gdny0WvsVkKkVvrBNxe6m_CmtcGJACCyG3j25GX17NA2ESdZ5CzeK27no_V6EPHj8G84VHmlGK_NyQwcI6N8Cvq83fdw';

async function testSearch() {
  console.log('Starting search test...');
  
  const requestBody = {
    model: 'MiniMax-M2.7',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `请搜索以下内容，返回搜索结果摘要（200字以内，中文）：什么是人工智能\n\n请直接给出搜索结果，不要重复问题。`
      }
    ]
  };

  const data = JSON.stringify(requestBody);

  const options = {
    hostname: 'api.minimaxi.com',
    path: '/anthropic/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve, reject) => {
    console.log('Making request to API...');
    const req = https.request(options, (res) => {
      console.log('Response status:', res.statusCode);
      let body = '';
      res.on('data', (chunk) => {
        console.log('Received chunk of size:', chunk.length);
        body += chunk;
      });
      res.on('end', () => {
        console.log('Response complete, body length:', body.length);
        console.log('Response:', body.substring(0, 800));
        try {
          const response = JSON.parse(body);
          let text = '';
          if (response.content && Array.isArray(response.content)) {
            const textContent = response.content.find(c => c.type === 'text');
            text = textContent?.text || '';
          }
          resolve(text);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request error:', e);
      reject(e);
    });
    
    req.write(data);
    req.end();
  });
}

testSearch()
  .then(result => {
    console.log('\nSearch result:', result);
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });

setTimeout(() => {
  console.log('Timeout reached');
  process.exit(1);
}, 20000);
