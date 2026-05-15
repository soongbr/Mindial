# MiniMax MCP 联网搜索配置指南

## 📋 概述

当前项目使用 **方案 B：Tavily API** 实现联网搜索功能。

### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **方案 A: MiniMax MCP Server** | 官方支持 | 需要 Rust 环境，构建复杂 | ⭐⭐⭐ |
| **方案 B: Tavily API** | 配置简单，免费额度 | 需要注册 API Key | ⭐⭐⭐⭐⭐ |

---

## ✅ 当前配置（方案 B：Tavily API）

### 已完成

- [x] 后端搜索服务：`backend/services/searchService.js`
- [x] 集成到 chatService：自动在每轮对话前执行搜索
- [x] 前端搜索结果展示：可展开/收起的 UI
- [x] SSE 流式推送搜索结果

### 当前状态

**目前使用 Mock 数据**，因为 Tavily API Key 尚未配置。

搜索结果会显示提示信息，引导配置真实 API Key。

### 启用真实搜索

1. **注册 Tavily**（免费）
   - 访问：https://app.tavily.com/
   - 注册账号
   - 获取 API Key

2. **配置 API Key**
   
   编辑 `backend/.env`：
   ```env
   TAVILY_API_KEY=tvly-你的真实 API_KEY
   ```

3. **重启后端服务**
   ```bash
   cd D:\培养基\backend
   npm start
   ```

### Tavily 免费额度

- **免费版**：每月 1000 次搜索
- **付费版**：$19/月，5000 次搜索
- 对于个人学习使用，免费版足够

---

## 📝 方案 A：MiniMax MCP Server（备选）

如果冉冉想使用官方的 MCP Server，需要：

1. **订阅 Token Plan**
   - 访问：https://platform.minimaxi.com/subscribe/token-plan
   
2. **安装 Rust**（用于构建依赖）
   ```powershell
   # Windows ARM64
   winget install Rustlang.Rustup
   ```

3. **配置 MCP**
   ```powershell
   claude mcp add -s user MiniMax `
     --env MINIMAX_API_KEY=你的 TokenPlan_API_KEY `
     --env MINIMAX_API_HOST=https://api.minimaxi.com `
     -- uvx minimax-coding-plan-mcp -y
   ```

**注意**：方案 A 需要 Rust 环境，在 Windows ARM64 上构建可能遇到问题。
推荐使用方案 B（Tavily API）。

---

## 🔧 技术实现细节

### 搜索流程

```
用户提问
   ↓
performWebSearch(query)  ← 先执行搜索
   ↓
获取搜索结果（Tavily API）
   ↓
将搜索结果 + 问题发送给 AI
   ↓
AI 生成回答
   ↓
前端展示回答 + 搜索结果（可展开）
```

### 代码结构

```
backend/
├── services/
│   ├── chatService.js      # AI 对话服务
│   └── searchService.js    # 搜索服务（Tavily）
└── .env                    # 环境变量配置

frontend/
├── src/
│   ├── App.tsx             # 主应用（搜索结果状态管理）
│   └── components/
│       └── NodeDetailPanel.tsx  # 搜索结果展示 UI
```

### API 格式

**Tavily Search API**：
```javascript
POST https://api.tavily.com/search
{
  "query": "搜索关键词",
  "api_key": "tvly-xxx",
  "max_results": 5,
  "search_depth": "basic"
}
```

**返回格式**：
```javascript
{
  "query": "搜索关键词",
  "results": [
    {
      "title": "网页标题",
      "url": "https://...",
      "snippet": "摘要内容"
    }
  ]
}
```

---

## 🎯 下一步

1. **注册 Tavily API**（5 分钟）
   - https://app.tavily.com/

2. **配置 API Key**
   - 编辑 `backend/.env`
   - 添加 `TAVILY_API_KEY=tvly-xxx`

3. **测试**
   - 重启后端
   - 在前端输入问题
   - 查看搜索结果展示

---

_卷卷整理 · 2026-05-05_
