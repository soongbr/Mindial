// 知识树节点类型
export interface KnowledgeNode {
  id: string;
  parentId: string | null;
  question: string;      // 主题/问题
  summary?: string;      // 综述（导入模式使用）
  answer: string;        // 回答
  concepts: string[];
  children: string[];     // 子节点 ID 数组
  createdAt: number;
  isStreamed: boolean;
  isExpanded?: boolean;   // 展开/折叠状态
  isImported?: boolean;   // 是否为导入模式生成
  sourceFile?: string;    // 来源文件
}

// 知识树整体结构
export interface KnowledgeTree {
  rootId: string | null;
  nodes: Record<string, KnowledgeNode>;
  currentNodeId: string | null;
  collapsedNodeIds: string[]; // ✅ 新增：存储折叠的节点 ID 数组
}

// API 请求/响应类型
export interface ChatRequest {
  message: string;
  useMCP?: boolean;
  detailLevel?: 'short' | 'long';
}

export interface ChatResponse {
  answer: string;
  concepts: string[];
  streamedAnswer?: string;
}

export interface MCPSearchResult {
  results: Array<{ title: string; snippet: string }>;
  query: string;
  timestamp: number;
}