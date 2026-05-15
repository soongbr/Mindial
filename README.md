# 🧪 培养基 (PeiYangJi) 1.0.0

AI 驱动的知识探索工具

## ✨ 功能特性

- 🌳 **知识树构建** - 输入主题，自动生成知识节点
- 🔍 **节点追问** - 对任意节点深入追问，扩展知识树
- 📍 **节点追溯** - 面包屑导航，快速回到任意祖先节点
- ⚡ **流式输出** - 打字机效果 + Markdown 渲染
- 📱 **响应式设计** - 支持电脑和手机访问
- 💾 **自动保存** - 知识树自动持久化到本地

## 🚀 快速开始

### 开发环境

```bash
# 1. 启动后端
cd backend
npm install
npm start

# 2. 启动前端（新终端）
cd frontend
npm install
npm run dev

# 3. 访问 http://localhost:5173
```

### 生产环境（打包部署）

```bash
# 1. 运行打包脚本
build.bat

# 2. 复制生成的 peiyangji-1.0.0-xxx 文件夹到服务器

# 3. 在服务器上安装依赖并启动
cd peiyangji-1.0.0-xxx
npm install --production
npm run start:prod

# 4. 访问 http://服务器 IP:3001
```

## 🔧 配置

复制 `backend/.env.example` 为 `backend/.env`，配置 API 密钥：

```env
MINIMAX_API_KEY=your_api_key_here
MINIMAX_BASE_URL=https://api.minimaxi.com
USE_BAILIAN=false
```

## 📦 技术栈

- **前端**: React 19 + TypeScript + Vite + ReactFlow
- **后端**: Node.js + Express
- **AI**: MiniMax M2.7 / 阿里云百炼 qwen-max

## 📝 更新日志

### 1.0.0 (2026-05-03)
- ✅ 主题初始化
- ✅ 节点树展示
- ✅ 节点追问
- ✅ 节点追溯
- ✅ 流式输出
- ✅ 数据持久化
- ✅ 生产环境打包

---

_持续进化，永无止境！_ 🐾
