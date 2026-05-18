// Polyfills for Node.js v24+ compatibility with pdf-parse
// Must be set BEFORE any other requires
global.DOMMatrix = class DOMMatrix { constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; } };
global.ImageData = class ImageData { constructor() {} };
global.Path2D = class Path2D { constructor() {} };

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const routes = require('./routes');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// 初始化数据库
initDb();

// 信任代理 IP（用于限流中间件获取真实 IP）
app.set('trust proxy', 1);

// API routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: '1.0.0' });
});

// 生产环境：提供前端静态文件
if (IS_PRODUCTION) {
  const publicPath = path.join(__dirname, 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }
}

app.listen(PORT, () => {
  console.log(`🧪 培养基 backend running on http://localhost:${PORT}`);
  if (IS_PRODUCTION) {
    console.log(`📦 Production mode: serving static files from /public`);
  }
});