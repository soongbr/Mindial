import { useState, useCallback, useEffect, useMemo, Component } from 'react';
import MindMap from './components/MindMap';
import NodeDetailPanel from './components/NodeDetailPanel';
import ConversationHistory from './components/ConversationHistory';
import KnowledgeBaseUpload from './components/KnowledgeBaseUpload';
import KnowledgeBaseSidebar from './components/KnowledgeBaseSidebar';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminPanel from './components/AdminPanel';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import type { KnowledgeTree, KnowledgeNode } from './types';
import './App.css';

// 错误边界组件，防止渲染崩溃导致白屏
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#e53e3e' }}>
          <h3>⚠️ 页面出错了</h3>
          <p style={{ fontSize: '14px', color: '#666' }}>{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ marginTop: '16px', padding: '8px 20px', background: '#667eea', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// API 地址（使用相对路径，通过 Vite proxy 转发到后端）
const API_BASE = '/api';

// 生成唯一 ID
const generateId = () => Math.random().toString(36).substring(2, 15);

// 创建空知识树
const createEmptyTree = (): KnowledgeTree => ({
  rootId: null,
  nodes: {},
  currentNodeId: null,
  collapsedNodeIds: [],
});

// 对话类型
interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AuthProvider>
  );
}

function AppContent() {
  const { user, token, loading: authLoading, logout } = useAuth();
  const [authPage, setAuthPage] = useState<'login' | 'register'>('login');
  const [showAdmin, setShowAdmin] = useState(false);

  // 带认证的 fetch 辅助函数
  const fetchWithAuth = useCallback((url: string, options?: RequestInit) => {
    const headers = {
      ...(options?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers });
  }, [token]);
  const [tree, setTree] = useState<KnowledgeTree>(createEmptyTree);
  const [inputMessage, setInputMessage] = useState('');
  const [detailLevel, setDetailLevel] = useState<'short' | 'long'>('short');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 流式输出相关
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 联网搜索相关
  const [searchResults, setSearchResults] = useState<string | null>(null);
  const [searchStructured, setSearchStructured] = useState<Array<{title: string; link: string; snippet: string}>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  // 知识库检索相关（RAG）
  const [kbResults, setKbResults] = useState<Array<{content: string; score: number; fileName: string}>>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbDone, setKbDone] = useState(false);

  // 引用来源
  const [references, setReferences] = useState<{
    web: Array<{ title: string; link: string; snippet: string }>;
    kb: Array<{ content: string; score: number; fileName: string }>;
  }>({ web: [], kb: [] });

  // 对话历史相关
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 导入模式相关
  const [showUploadModal, setShowUploadModal] = useState(false);
  // isImportedMode 已废弃，但保留 setIsImportedMode 供后续使用
  const [, setIsImportedMode] = useState(false);
  // 侧边栏刷新 key（上传后+1触发重加载）
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  // 知识库模式（自由探索 / 目标学习）
  const [knowledgeMode, setKnowledgeMode] = useState<'explore' | 'learn'>('learn');

  // 正在生成导图的文档 ID
  const [generatingDocumentId, setGeneratingDocumentId] = useState<string | null>(null);

  // 知识库参考相关
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(true);  // 是否参考知识库
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);  // 选中的文档 ID
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);  // 是否启用联网搜索

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetchWithAuth(`${API_BASE}/conversations`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
        
        // 如果有当前对话 ID，加载对应的知识树
        if (data.currentConversationId) {
          setCurrentConversationId(data.currentConversationId);
          const convResponse = await fetchWithAuth(`${API_BASE}/conversations/${data.currentConversationId}`);
          if (convResponse.ok) {
            const convData = await convResponse.json();
            setTree(convData.tree || createEmptyTree());
          }
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchWithAuth]);

  // 加载单个对话详情
  const loadConversation = useCallback(async (id: string) => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/conversations/${id}`);
      if (response.ok) {
        const data = await response.json();
        setTree(data.tree || createEmptyTree());
        setCurrentConversationId(id);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError('加载对话失败');
    }
  }, [fetchWithAuth]);

  // 保存当前对话
  const saveConversation = useCallback(async (treeData: KnowledgeTree) => {
    try {
      if (currentConversationId) {
        // 更新现有对话
        await fetchWithAuth(`${API_BASE}/conversations/${currentConversationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tree: treeData }),
        });
        // 更新列表中的更新时间
        setConversations(prev => prev.map(c => 
          c.id === currentConversationId 
            ? { ...c, updatedAt: Date.now() }
            : c
        ).sort((a, b) => b.updatedAt - a.updatedAt));
      } else {
        // 创建新对话
        const response = await fetchWithAuth(`${API_BASE}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tree: treeData }),
        });
        if (response.ok) {
          const data = await response.json();
          setCurrentConversationId(data.conversation.id);
          loadConversations();
        }
      }
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }, [currentConversationId, loadConversations]);

  // 创建新对话
  const handleNewConversation = useCallback(() => {
    setTree(createEmptyTree());
    setCurrentConversationId(null);
    setInputMessage('');
    setIsHistoryOpen(false);
    setError(null);
  }, []);

  // 选择对话
  const handleSelectConversation = useCallback((id: string) => {
    loadConversation(id);
    setIsHistoryOpen(false);
  }, [loadConversation]);

  // 删除对话
  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/conversations/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (currentConversationId === id) {
          handleNewConversation();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setError('删除对话失败');
    }
  }, [currentConversationId, handleNewConversation, fetchWithAuth]);

  // 流式创建根节点
  const handleInitTopic = async () => {
    if (!inputMessage.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setStreamingAnswer('');
    setIsStreaming(true);
    setSearchResults(null);
    setSearchStructured([]);
    setSearchLoading(false);
    setSearchError(null);
    setSearchDone(false);
    setKbResults([]);
    setKbLoading(false);
    setKbDone(false);
    setReferences({ web: [], kb: [] });

    const rootId = generateId();
    let fullAnswer = '';
    let concepts: string[] = [];

    const rootNode: KnowledgeNode = {
      id: rootId,
      parentId: null,
      question: inputMessage,
      answer: '',
      concepts: [],
      children: [],
      createdAt: Date.now(),
      isStreamed: true,
    };

    const newTree: KnowledgeTree = {
      rootId,
      nodes: { [rootId]: rootNode },
      currentNodeId: rootId,
      collapsedNodeIds: [],
    };

    setTree(newTree);
    setInputMessage('');

    try {
      const response = await fetchWithAuth(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputMessage,
          detailLevel,
          enableSearch: webSearchEnabled,
          enableKnowledgeBase: knowledgeBaseEnabled,
          knowledgeBaseDocumentIds: knowledgeBaseEnabled ? selectedDocumentIds : []
        }),
      });

      if (!response.ok) throw new Error('API 请求失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('无法读取响应流');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          let eventType = '';
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          }

          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              // 处理搜索事件（初始化主题）
              if (eventType === 'search_start') {
                setSearchLoading(true);
                setSearchError(null);
              } else if (eventType === 'search_done') {
                setSearchLoading(false);
                setSearchResults(data.results || null);
                setSearchStructured(data.structured || []);
                setSearchDone(true);
              } else if (eventType === 'search_error') {
                setSearchLoading(false);
                setSearchError(data.error || '搜索失败');
                setSearchDone(true);
              // 处理知识库检索事件（RAG）
              } else if (eventType === 'kb_start') {
                setKbLoading(true);
              } else if (eventType === 'kb_done') {
                setKbLoading(false);
                setKbResults(data.results || []);
                setKbDone(true);
              } else if (data.fullText !== undefined) {
                fullAnswer = data.fullText;
                setStreamingAnswer(fullAnswer);

                setTree(prev => ({
                  ...prev,
                  nodes: {
                    ...prev.nodes,
                    [rootId]: {
                      ...prev.nodes[rootId],
                      answer: fullAnswer,
                    },
                  },
                }));
              }

              if (data.concepts) {
                concepts = data.concepts;
              }
              if (data.references) {
                setReferences(data.references);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      const conceptsMatch = fullAnswer.match(/关键概念 [：:]\s*([^\n]+)/i);
      if (conceptsMatch && concepts.length === 0) {
        const conceptsStr = conceptsMatch[1];
        concepts = conceptsStr.split(/[,，]/).map(s => s.replace(/[\[\]]/g, '').trim()).filter(Boolean);
      }

      const finalAnswer = fullAnswer.split(/关键概念 [：:]/i)[0].trim();

      setTree(prev => {
        const updatedTree: KnowledgeTree = {
          ...prev,
          nodes: {
            ...prev.nodes,
            [rootId]: {
              ...rootNode,
              answer: finalAnswer,
              concepts,
              isStreamed: false,
            },
          },
        };
        saveConversation(updatedTree);
        return updatedTree;
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : '发生错误');
      setTree(createEmptyTree());
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  // 流式追问子节点
  // 构建祖先上下文：从当前节点的父节点往上追溯到根，收集所有问答对
  const buildAncestorContext = useCallback((parentNodeId: string | null): string => {
    if (!parentNodeId) return '';
    const path: KnowledgeNode[] = [];
    let current: KnowledgeNode | undefined = tree.nodes[parentNodeId];
    while (current) {
      path.unshift(current);
      current = current.parentId ? tree.nodes[current.parentId] : undefined;
    }
    if (path.length === 0) return '';
    const parts = ['[上下文 - 前面的讨论]'];
    path.forEach((n, i) => {
      parts.push(`Q${i + 1}: ${n.question}`);
      if (n.answer) parts.push(`A${i + 1}: ${n.answer}`);
    });
    return parts.join('\n');
  }, [tree.nodes]);

  const handleChildMessage = async (parentId: string, message: string) => {
    setIsLoading(true);
    setError(null);
    setStreamingAnswer('');
    setIsStreaming(true);
    setSearchResults(null);
    setSearchStructured([]);
    setSearchLoading(false);
    setSearchError(null);
    setSearchDone(false);
    setKbResults([]);
    setKbLoading(false);
    setKbDone(false);

    const childId = generateId();
    let fullAnswer = '';
    let concepts: string[] = [];

    const childNode: KnowledgeNode = {
      id: childId,
      parentId,
      question: message,
      answer: '',
      concepts: [],
      children: [],
      createdAt: Date.now(),
      isStreamed: true,
    };

    setTree(prev => {
      const parent = prev.nodes[parentId];
      if (!parent) return prev;

      const newNodes = {
        ...prev.nodes,
        [childId]: childNode,
        [parentId]: {
          ...parent,
          children: [...parent.children, childId],
        },
      };

      const newTree = {
        ...prev,
        nodes: newNodes,
        currentNodeId: childId,
        collapsedNodeIds: prev.collapsedNodeIds.filter(id => id !== parentId),
      };

      return newTree;
    });

    try {
      // 构建完整祖先链上下文（从根到父节点）
      const ancestorContext = buildAncestorContext(parentId);
      const prefix = ancestorContext
        ? ancestorContext + '\n\n[当前问题]\n'
        : '';
      const fullMessage = prefix + message;

      const response = await fetchWithAuth(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage,
          detailLevel,
          enableSearch: webSearchEnabled,
          enableKnowledgeBase: knowledgeBaseEnabled,
          knowledgeBaseDocumentIds: knowledgeBaseEnabled ? selectedDocumentIds : []
        }),
      });

      if (!response.ok) throw new Error('API 请求失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('无法读取响应流');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          let eventType = '';
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          }

          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              // 处理搜索事件（追问）
              if (eventType === 'search_start') {
                setSearchLoading(true);
                setSearchError(null);
              } else if (eventType === 'search_done') {
                setSearchLoading(false);
                setSearchResults(data.results || null);
                setSearchStructured(data.structured || []);
                setSearchDone(true);
              } else if (eventType === 'search_error') {
                setSearchLoading(false);
                setSearchError(data.error || '搜索失败');
                setSearchDone(true);
              // 处理知识库检索事件（RAG）
              } else if (eventType === 'kb_start') {
                setKbLoading(true);
              } else if (eventType === 'kb_done') {
                setKbLoading(false);
                setKbResults(data.results || []);
                setKbDone(true);
              } else if (data.fullText !== undefined) {
                fullAnswer = data.fullText;
                setStreamingAnswer(fullAnswer);

                setTree(prev => ({
                  ...prev,
                  nodes: {
                    ...prev.nodes,
                    [childId]: {
                      ...prev.nodes[childId],
                      answer: fullAnswer,
                    },
                  },
                }));
              }

              if (data.concepts) {
                concepts = data.concepts;
              }
              if (data.references) {
                setReferences(data.references);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      const conceptsMatch = fullAnswer.match(/关键概念 [：:]\s*([^\n]+)/i);
      if (conceptsMatch && concepts.length === 0) {
        const conceptsStr = conceptsMatch[1];
        concepts = conceptsStr.split(/[,，]/).map(s => s.replace(/[\[\]]/g, '').trim()).filter(Boolean);
      }

      const finalAnswer = fullAnswer.split(/关键概念 [：:]/i)[0].trim();

      setTree(prev => {
        const parent = prev.nodes[parentId];
        if (!parent) return prev;

        const newNodes = {
          ...prev.nodes,
          [childId]: {
            ...childNode,
            answer: finalAnswer,
            concepts,
            isStreamed: false,
          },
          [parentId]: {
            ...parent,
            children: [...parent.children.filter(c => c !== childId), childId],
          },
        };

        const newTree = {
          ...prev,
          nodes: newNodes,
        };

        saveConversation(newTree);
        return newTree;
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : '发生错误');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  // 切换文档选中状态
  const handleDocumentSelect = (documentId: string, selected: boolean) => {
    if (selected) {
      setSelectedDocumentIds(prev => [...prev, documentId]);
    } else {
      setSelectedDocumentIds(prev => prev.filter(id => id !== documentId));
    }
  };

  // 为指定文档（支持逗号分隔的多文档 ID）生成导图
  const handleGenerateMindMap = async (documentId: string) => {
    setGeneratingDocumentId(documentId);
    setError(null);

    try {
      // 支持多文档：用逗号分隔的 ID 列表
      const isMultiDoc = documentId.includes(',');
      const url = isMultiDoc
        ? `${API_BASE}/knowledge/generate-mindmap-multi`
        : `${API_BASE}/knowledge/generate-mindmap/${documentId}`;
      
      const body = isMultiDoc
        ? JSON.stringify({ documentIds: documentId.split(',') })
        : undefined;

      const response = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '生成导图失败');
      }

      // 设置导图数据
      setTree(data.tree);
      setCurrentConversationId(data.conversationId);
      setIsImportedMode(true);

      // 刷新对话列表
      loadConversations();

    } catch (err) {
      console.error('Generate mind map error:', err);
      setError(err instanceof Error ? err.message : '生成导图失败');
    } finally {
      setGeneratingDocumentId(null);
    }
  };

  // 点击节点选择
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setTree(prev => {
        const newTree = { ...prev, currentNodeId: nodeId };
        return newTree;
      });
      // 切换节点时清除上一个节点的搜索/引用状态
      setStreamingAnswer('');
      setSearchResults(null);
      setSearchStructured([]);
      setSearchDone(false);
      setSearchLoading(false);
      setSearchError(null);
      setKbResults([]);
      setKbDone(false);
      setKbLoading(false);
      setReferences({ web: [], kb: [] });
    },
    []
  );

  // 编辑节点问题
  const handleEditQuestion = useCallback((nodeId: string, newQuestion: string) => {
    if (!newQuestion.trim()) return;
    setTree(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [nodeId]: { ...prev.nodes[nodeId], question: newQuestion.trim() },
      },
    }));
  }, []);

  // 重新回答（针对已有节点重新生成 AI 回答）
  const handleReAnswer = useCallback(async (nodeId: string) => {
    const node = tree.nodes[nodeId];
    if (!node || !node.question.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setStreamingAnswer('');
    setIsStreaming(true);
    setSearchResults(null);
    setSearchStructured([]);
    setSearchLoading(false);
    setSearchError(null);
    setSearchDone(false);
    setKbResults([]);
    setKbLoading(false);
    setKbDone(false);
    setReferences({ web: [], kb: [] });

    let fullAnswer = '';
    let concepts: string[] = [];

    try {
      // 构建完整祖先链上下文（从根到父节点）
      const ancestorContext = buildAncestorContext(node.parentId);
      const prefix = ancestorContext
        ? ancestorContext + '\n\n[当前问题]\n'
        : '';
      const fullMessage = prefix + node.question;

      const response = await fetchWithAuth(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage,
          detailLevel,
          enableSearch: webSearchEnabled,
          enableKnowledgeBase: knowledgeBaseEnabled,
          knowledgeBaseDocumentIds: knowledgeBaseEnabled ? selectedDocumentIds : []
        }),
      });

      if (!response.ok) throw new Error('API 请求失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('无法读取响应流');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          let eventType = '';
          if (line.startsWith('event: ')) eventType = line.substring(7).trim();
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              if (eventType === 'search_start') { setSearchLoading(true); setSearchError(null); }
              else if (eventType === 'search_done') { setSearchLoading(false); setSearchResults(data.results || null); setSearchStructured(data.structured || []); setSearchDone(true); }
              else if (eventType === 'search_error') { setSearchLoading(false); setSearchError(data.error || '搜索失败'); setSearchDone(true); }
              else if (eventType === 'kb_start') { setKbLoading(true); }
              else if (eventType === 'kb_done') { setKbLoading(false); setKbResults(data.results || []); setKbDone(true); }
              else if (data.fullText !== undefined) {
                fullAnswer = data.fullText;
                setStreamingAnswer(fullAnswer);
                setTree(prev => ({
                  ...prev,
                  nodes: { ...prev.nodes, [nodeId]: { ...prev.nodes[nodeId], answer: fullAnswer } },
                }));
              }
              if (data.concepts) concepts = data.concepts;
              if (data.references) setReferences(data.references);
            } catch (e) { /* ignore */ }
          }
        }
      }

      // 更新节点并保存
      setTree(prev => {
        const updated = {
          ...prev,
          nodes: {
            ...prev.nodes,
            [nodeId]: {
              ...prev.nodes[nodeId],
              answer: fullAnswer,
              concepts,
              isStreamed: true,
            },
          },
        };
        saveConversation(updated);
        return updated;
      });
    } catch (err) {
      console.error('Re-answer error:', err);
      setError(err instanceof Error ? err.message : '重新回答失败');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [tree, isLoading, detailLevel, webSearchEnabled, knowledgeBaseEnabled, selectedDocumentIds, saveConversation]);

  // 获取当前选中节点
  const currentNode = tree.currentNodeId ? tree.nodes[tree.currentNodeId] : null;

  // 构建追溯路径
  const currentPath = useMemo(() => {
    const path: KnowledgeNode[] = [];
    let current = tree.currentNodeId ? tree.nodes[tree.currentNodeId] : null;
    while (current) {
      path.unshift(current);
      current = current.parentId ? tree.nodes[current.parentId] : null;
    }
    return path;
  }, [tree.nodes, tree.currentNodeId]);

  // 组件加载时读取对话列表
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 切换账号时自动刷新所有状态
  useEffect(() => {
    setTree(createEmptyTree());
    setCurrentConversationId(null);
    setConversations([]);
    setInputMessage('');
    setError(null);
    setSelectedDocumentIds([]);
    setSidebarRefreshKey(k => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <ErrorBoundary>
    <div className="app">
      {/* 未登录 → 显示登录/注册页 */}
      {authLoading ? (
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
          <p>加载中...</p>
        </div>
      ) : !user ? (
        <>
          {authPage === 'login' ? (
            <LoginPage onGoRegister={() => setAuthPage('register')} />
          ) : (
            <RegisterPage onGoLogin={() => setAuthPage('login')} />
          )}
        </>
      ) : (
        <>
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 历史按钮 */}
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            style={{
              padding: '8px 16px',
              background: isHistoryOpen ? '#667eea' : '#f0f0f0',
              color: isHistoryOpen ? '#fff' : '#333',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            📜 历史
          </button>
          <div>
            <h1 style={{ margin: 0 }}>🧪 培养基</h1>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>AI 驱动的知识探索工具</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
          {user.isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              style={{
                padding: '6px 12px',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fbbf24',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ⚙️ 管理
            </button>
          )}
          <span style={{ color: '#666', fontSize: '12px' }}>
            {user.email}
          </span>
          <button
            onClick={logout}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              color: '#999',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            退出
          </button>
        </div>
      </header>

      <main className="app-main">
        {/* 左侧：知识库侧边栏 */}
        <KnowledgeBaseSidebar
          key={`kb-sidebar-${user?.id || 'anon'}-${sidebarRefreshKey}`}
          apiBase={API_BASE}
          token={token!}
          onGenerateMindMap={handleGenerateMindMap}
          generatingDocumentId={generatingDocumentId}
          onUploadClick={() => setShowUploadModal(true)}
          currentMode={knowledgeMode}
          onModeChange={setKnowledgeMode}
          selectedDocumentIds={selectedDocumentIds}
          onDocumentSelect={handleDocumentSelect}
        />

        {/* 中间：思维导图区域 */}
        <aside className="mindmap-sidebar">
          <h2>知识导图</h2>
          {tree.rootId ? (
            <MindMap
              key={`mindmap-${tree.rootId}-${Object.keys(tree.nodes).length}`}
              tree={tree}
              onNodeClick={handleNodeClick}
              collapsedNodeIds={tree.collapsedNodeIds}
            />
          ) : (
            <div className="empty-tree">输入主题开始探索</div>
          )}
        </aside>

        {/* 右侧：节点详情面板 */}
        <section className="detail-panel">
          <NodeDetailPanel
            node={currentNode}
            currentPath={currentPath}
            onNodeClick={handleNodeClick}
            onChildMessage={(message) =>
              currentNode && handleChildMessage(currentNode.id, message)
            }
            onEditQuestion={handleEditQuestion}
            onReAnswer={handleReAnswer}
            isLoading={isLoading}
            streamingAnswer={streamingAnswer}
            isStreaming={isStreaming}
            searchResults={searchResults}
            searchStructured={searchStructured}
            searchLoading={searchLoading}
            searchError={searchError}
            searchDone={searchDone}
            kbResults={kbResults}
            kbLoading={kbLoading}
            kbDone={kbDone}
            references={references}
          />

          {/* 输入区域 - 当没有根节点时显示 */}
          {!tree.rootId && (
            <div className="input-area-overlay">
              <textarea
                className="message-input"
                placeholder="输入你想探索的主题..."
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleInitTopic();
                  }
                }}
                disabled={isLoading}
              />
              <div className="input-options">
                <label>
                  <input
                    type="radio"
                    checked={detailLevel === 'short'}
                    onChange={() => setDetailLevel('short')}
                  />
                  简短回答
                </label>
                <label>
                  <input
                    type="radio"
                    checked={detailLevel === 'long'}
                    onChange={() => setDetailLevel('long')}
                  />
                  详细解释
                </label>
                <label style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="checkbox"
                    checked={knowledgeBaseEnabled}
                    onChange={(e) => setKnowledgeBaseEnabled(e.target.checked)}
                  />
                  📚 参考知识库
                </label>
                <label style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="checkbox"
                    checked={webSearchEnabled}
                    onChange={(e) => setWebSearchEnabled(e.target.checked)}
                  />
                  🌐 联网搜索
                </label>
                {selectedDocumentIds.length > 0 && knowledgeBaseEnabled && (
                  <span style={{ fontSize: '11px', color: '#667eea', marginLeft: '4px' }}>
                    ({selectedDocumentIds.length} 个文档)
                  </span>
                )}
              </div>
              <button
                className="submit-btn"
                onClick={handleInitTopic}
                disabled={isLoading || !inputMessage.trim()}
              >
                {isLoading ? '思考中...' : '开始探索'}
              </button>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </section>
      </main>

      {/* 对话历史面板 */}
      <ConversationHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        currentConversationId={currentConversationId}
        conversations={conversations}
        loading={historyLoading}
      />

      {/* 知识库上传弹窗 */}
      {showUploadModal && (
        <KnowledgeBaseUpload
          apiBase={API_BASE}
          token={token!}
          onSuccess={() => {
            // 上传成功，关闭弹窗并清除旧错误
            setShowUploadModal(false);
            setError(null);
            // 触发侧边栏刷新文档列表
            setSidebarRefreshKey(k => k + 1);
            loadConversations();
          }}
          onError={(error) => {
            setError(error);
            setShowUploadModal(false);
          }}
          onCancel={() => setShowUploadModal(false)}
        />
      )}
      {/* 管理员后台面板 */}
      {showAdmin && <AdminPanel apiBase={API_BASE} onClose={() => setShowAdmin(false)} />}
      </>
      )}
    </div>
    </ErrorBoundary>
  );
}

export default App;
