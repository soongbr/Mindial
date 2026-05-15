const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

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
    
    // SPA 路由回退
    app.get('*', (req, res) => {
      const indexPath = path.join(publicPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });
  }
}

app.listen(PORT, () => {
  console.log(`🧪 培养基 backend running on http://localhost:${PORT}`);
  if (IS_PRODUCTION) {
    console.log(`📦 Production mode: serving static files from /public`);
  }
});