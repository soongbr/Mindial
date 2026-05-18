const https = require('https');

const API_KEY = 'sk-cp-DeMH6XqW6Yp1TXOHvuSn31Elps5gdny0WvsVkKkVvrBNxe6m_CmtcGJACCyG3j25GX17NA2ESdZ5CzeK27no_V6EPHj8G84VHmlGK_NyQwcI6N8Cvq83fdw';

const requestBody = {
  model: 'MiniMax-M2.7',
  max_tokens: 100,
  messages: [
    {
      role: 'user',
      content: 'Hello, just testing the API'
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

console.log('Testing MiniMax API...');

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Response:', body.substring(0, 500));
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.write(data);
req.end();

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 15000);
