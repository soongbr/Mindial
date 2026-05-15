# 联网搜索功能测试指南

## ✅ 已实现功能

### 后端 (chatService.js)
- [x] 每轮对话自动执行搜索（`performWebSearch`）
- [x] 搜索结果通过 SSE 推送（`searchResults` 字段）
- [x] 支持 Tavily API（当前使用 Mock 数据）
- [x] 错误处理（搜索失败不影响主流程）

### 前端 (App.tsx + NodeDetailPanel.tsx)
- [x] 接收搜索结果状态
- [x] 默认收起搜索结果
- [x] 点击展开/收起
- [x] 支持链接跳转（新标签页打开）
- [x] 切换节点时重置搜索状态

---

## 🔧 配置搜索 API

### 当前状态
使用 **Mock 数据**（未配置真实 API）

### 启用真实搜索

#### 方案 A：Tavily API（推荐）
1. 注册：https://app.tavily.com/
2. 获取 API Key
3. 编辑 `backend/.env`：
   ```env
   TAVILY_API_KEY=tvly-你的 API_KEY
   ```
4. 重启后端

#### 方案 B：MiniMax MCP Server（需要 VS Build Tools）
等待冉冉安装好 Visual Studio Build Tools 后配置

---

## 🧪 测试步骤

### 1. 启动服务
```bash
# 后端
cd D:\培养基\backend
npm start

# 前端
cd D:\培养基\frontend
npm run dev

# 前端 Tunnel（如果需要）
C:\tools\cloudflared.exe tunnel --url http://localhost:5173
```

### 2. 访问前端
打开浏览器访问最新的 Tunnel 地址：
```
https://portal-jewel-marker-barely.trycloudflare.com
```

### 3. 测试搜索功能

1. **输入主题**：例如 "AI 是什么"
2. **点击"开始探索"**
3. **观察搜索结果**：
   - 回答下方显示 "🔍 已检索到 X 个相关结果"
   - 默认收起状态
4. **点击展开**：
   - 显示搜索结果列表
   - 每条结果包含：标题、摘要、链接
5. **点击链接**：
   - 新标签页打开网页

### 4. 测试追问
1. 在追问框输入问题
2. 发送后同样会触发搜索
3. 新的搜索结果会替换旧的

---

## 📊 预期效果

### Mock 数据（当前）
```
🔍 已检索到 3 个相关结果 ▼

展开后：
┌─────────────────────────────────────┐
│ 关于"AI"的相关信息                   │
│ https://example.com/1               │
│ 这是搜索结果摘要示例...              │
├─────────────────────────────────────┤
│ AI 详细介绍                          │
│ https://example.com/2               │
│ 更多内容请看这里...                  │
└─────────────────────────────────────┘
```

### 真实数据（配置 API 后）
```
🔍 已检索到 5 个相关结果 ▼

展开后：
┌─────────────────────────────────────┐
│ 人工智能 - 维基百科                  │
│ https://zh.wikipedia.org/...        │
│ 人工智能是研究、开发用于模拟...      │
├─────────────────────────────────────┤
│ AI 技术最新进展 2026                 │
│ https://example.com/ai-2026         │
│ 2026 年 AI 领域的最新突破和趋势...    │
└─────────────────────────────────────┘
```

---

## 🐛 常见问题

### Q1: 看不到搜索结果
- 检查控制台是否有 `Search results: X items` 日志
- 确认 `ENABLE_MCP=true` 在 `.env` 中
- 检查前端是否正确接收 `searchResults` 数据

### Q2: 搜索结果一直是 Mock 数据
- 检查 `TAVILY_API_KEY` 是否配置
- 查看后端日志：`Tavily API Key not configured, using mock data`

### Q3: 点击展开没反应
- 检查浏览器控制台是否有错误
- 确认 `showSearchResults` 状态正确切换

---

## 📝 代码位置

| 功能 | 文件 | 说明 |
|------|------|------|
| 搜索服务 | `backend/services/searchService.js` | Tavily API 调用 |
| AI 服务 | `backend/services/chatService.js` | 集成搜索到对话 |
| 状态管理 | `frontend/src/App.tsx` | searchResults 状态 |
| UI 展示 | `frontend/src/components/NodeDetailPanel.tsx` | 搜索结果组件 |

---

_卷卷整理 · 2026-05-05_
