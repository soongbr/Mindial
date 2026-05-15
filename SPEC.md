# 培养基 - 知识探索工具 MVP 技术规格

## 1. 项目概述

- **项目名称**: 培养基 (Culture Medium)
- **项目类型**: AI 驱动的知识探索 Web 应用
- **核心功能**: 用户输入主题 → AI 回答并提取关键概念 → 生成可点击的知识树 → 持续追问延伸知识网络
- **目标用户**: 深度学习者、行业研究者、知识工作者

## 2. 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | React + TypeScript + Vite | 快速开发，热更新 |
| 可视化 | D3.js (树状结构) | 灵活的数据可视化 |
| 后端 | Node.js + Express | 轻量 REST API |
| 存储 | JSON 文件 (本地) | MVP阶段简化，后续升级 PostgreSQL |
| AI | MiniMax API | 产品基座 |
| MCP | MiniMax MCP | 实时联网检索 |
| 知识库 | MiniMax Embedding + Qdrant | RAG 检索增强 |

## 3. 项目结构

```
D:\培养基\
├── frontend/          # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── utils/
│   │   └── App.tsx
│   ├── index.html
│   └── package.json
├── backend/           # Express 后端
│   ├── routes/
│   │   ├── index.js
│   │   ├── chat.js
│   │   ├── conversations.js
│   │   └── knowledge.js      # 知识库路由
│   ├── services/
│   │   ├── chatService.js
│   │   ├── documentParser.js   # 文档解析
│   │   ├── embeddingService.js  # Embedding API
│   │   ├── knowledgeBaseService.js  # 知识库+RAG
│   │   └── mcpSearchService.js
│   ├── data/
│   │   ├── temp/           # 上传临时文件
│   │   └── knowledge/      # 知识库存储
│   └── index.js
└── SPEC.md
```

## 4. 功能优先级 (MVP P0)

### 4.1 主题初始化
- 用户输入主题/问题
- 调用 MiniMax API 获取回答
- 从回答中提取关键概念（正则/关键词）
- 生成根节点 + 子节点（关键概念）

### 4.2 节点树展示
- 树状结构展示知识网络
- 每个节点显示问题和简要回答
- 当前选中节点高亮

### 4.3 节点追问
- 点击任意节点 → 弹出输入框
- 输入追问内容 → 调用 AI
- AI 回答后自动延伸子节点

### 4.4 节点追溯
- 侧边栏显示探索路径
- 点击可回到任意历史节点
- 记录每个节点的问答历史

### 4.5 MCP 联网
- 通过 MiniMax MCP 获取实时信息
- 可手动/自动触发

### 4.6 流式输出 ✅
- AI 回答使用流式传输 (SSE)
- 前端打字机效果展示
- Markdown 格式支持（粗体、斜体、代码、列表等）
- 流式光标动画

### 4.7 回答长度控制
- 默认简短回答（约100字）
- 提供「详细解释」按钮（约500字）

## 5. 数据模型

### 节点 (Node)
```typescript
interface Node {
  id: string;           // 唯一ID (uuid)
  parentId: string | null;  // 父节点ID
  question: string;     // 问题
  answer: string;       // 回答
  concepts: string[];   // 关键概念列表
  children: Node[];     // 子节点
  createdAt: number;    // 创建时间戳
  isStreamed: boolean;  // 是否流式输出中
}
```

### 知识树 (KnowledgeTree)
```typescript
interface KnowledgeTree {
  rootId: string;       // 根节点ID
  nodes: Record<string, Node>;  // 所有节点
  currentNodeId: string; // 当前选中节点
}
```

## 6. API 设计

### POST /api/chat
发送消息，获取 AI 回答

**Request:**
```json
{
  "message": "什么是大模型？",
  "useMCP": false,
  "detailLevel": "short"
}
```

**Response:**
```json
{
  "answer": "大模型是...",
  "concepts": ["transformer", "参数", "预训练"],
  "streamedAnswer": "大模型是..."
}
```

### GET /api/history
获取知识树数据

### POST /api/save
保存知识树到 JSON

### GET /api/mcp-search
调用 MCP 联网搜索

## 7. 开发计划

- [x] M1: 项目初始化，搭建框架
- [x] M2: 基础前端界面，节点树展示
- [x] M3: 后端 API，AI 调用
- [x] M4: 流式输出 ✅
- [x] M5: MCP 联网集成 ✅
- [x] M6: 节点追问和追溯 ✅
- [x] M7: 知识库导入模式 ✅ (0.6版本)

## 8. 新功能：知识库管理 + RAG 检索增强 (M7)

### 8.1 功能概述
用户上传素材文档 → 系统解析、切片、向量存储 → 用户提问时可选择"参考知识库" → RAG 检索相关段落 → AI 结合知识库内容生成回答 → 附上引用来源

### 8.2 用户流程
```
用户上传素材 → 系统解析入库 → 用户提问时选择"参考知识库"
→ 系统检索相关段落 → 结合知识库内容生成回答 → 附上引用来源
```

### 8.3 技术实现

**后端组件：**
| 文件 | 功能 |
|------|------|
| `routes/knowledge.js` | 知识库 API 路由 |
| `services/documentParser.js` | 文档解析（PDF/Word/TXT/Markdown） |
| `services/embeddingService.js` | MiniMax Embedding API + Fallback |
| `services/knowledgeBaseService.js` | Qdrant 向量库 + RAG 检索 |

**前端组件：**
| 文件 | 功能 |
|------|------|
| `components/KnowledgeBasePanel.tsx` | 知识库管理面板 |

### 8.4 支持文件格式
- PDF (.pdf)
- Word (.docx, .doc)
- Markdown (.md, .markdown)
- 文本 (.txt)

### 8.5 核心 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/knowledge/init` | GET | 初始化知识库 |
| `/api/knowledge/upload` | POST | 上传文档 |
| `/api/knowledge/search` | GET | 搜索知识库 |
| `/api/knowledge/files` | GET | 获取文件列表 |
| `/api/knowledge/files/:fileId` | DELETE | 删除文件 |

### 8.6 切片策略
- 滑动窗口：每段 500 字，重叠 50 字
- 按句子分割（中文句号、问号、感叹号）
- 保留段落上下文关联

### 8.7 RAG 召回
- Top-K 召回（默认 K=3）
- 相似度阈值过滤（默认 0.5）
- 引用标注格式：`[来源: 文件名.pdf, 段落N]`

### 8.8 Embedding 策略
1. 优先调用 MiniMax Embedding API (`emb-text-01`)
2. API 不可用时使用 Fallback 伪向量（词哈希 + 归一化）
3. 向量维度：1024（emb-text-01 输出）

### 8.9 知识库文件导入（新增）
除了 RAG 检索，还支持**直接导入文档生成思维导图**：
- 用户上传文件 → AI 分析文档结构 → 自动生成思维导图节点
- 导入后自动创建对话，可在树状视图中浏览和追问
- 支持的文件：PDF、DOCX、DOC、MD、TXT（最大 10MB）
- 思维导图生成使用 `analyzeAndGenerateMindMap` 函数（MiniMax M2.7）

## 开发进度
- 2026-05-01: 完成项目初始化、前端界面开发（输入框、树形结构展示、节点详情、追问功能）
- 2026-05-01: 完成流式输出功能，支持 Markdown 格式渲染
- 2026-05-06: 完成 MCP 联网搜索集成
- 2026-05-06: 开始知识库导入模式开发
- 2026-05-06: 完成后端核心服务开发（embeddingService, documentParser, knowledgeBaseService）
- **2026-05-08: 完成知识库文件导入功能（0.6版本）**
  - 修复 documentParser.js 缺少 analyzeAndGenerateMindMap 函数
  - 修复 Qdrant point ID 必须为 UUID v4 格式
  - 修复上传接口返回格式，完整支持导入流程

---

_最后更新: 2026-05-08_
