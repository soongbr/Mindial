import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { KnowledgeNode } from '../types';

/**
 * 解析搜索结果，支持两种格式：
 * 1. JSON 格式（来自 MCP 搜索）：{ "organic": [{ "title": "...", "link": "...", "snippet": "..." }] }
 * 2. 纯文本格式（降级处理）
 */
interface SearchResult {
  title?: string;
  link?: string;
  snippet?: string;
}

function parseSearchResultsAsLinks(text: string): React.ReactNode[] {
  if (!text || !text.trim()) {
    return [<span key="empty" style={{ color: '#999' }}>暂无搜索结果</span>];
  }

  // 尝试解析 JSON 格式（MCP 搜索返回的格式）
  try {
    const parsed = JSON.parse(text);
    if (parsed.organic && Array.isArray(parsed.organic)) {
      const results: SearchResult[] = parsed.organic;
      if (results.length === 0) {
        return [<span key="empty" style={{ color: '#999' }}>暂无搜索结果</span>];
      }
      return results.map((item, idx) => (
        <div key={`result-${idx}`} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: idx < results.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
          {item.title && item.link && (
            <a 
              href={item.link} 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ color: '#667eea', fontSize: '14px', fontWeight: 500, display: 'block', marginBottom: '4px', textDecoration: 'none' }}
            >
              {item.title} 🔗
            </a>
          )}
          {item.snippet && (
            <p style={{ margin: '0', color: '#666', fontSize: '13px', lineHeight: 1.5 }}>{item.snippet}</p>
          )}
          {item.link && !item.title && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', fontSize: '13px' }}>
              {item.link}
            </a>
          )}
        </div>
      ));
    }
  } catch (e) {
    // 不是 JSON 格式，尝试按纯文本处理
  }

  // 纯文本格式处理
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return [<span key="empty" style={{ color: '#999' }}>暂无搜索结果</span>];
  }

  const elements: React.ReactNode[] = [];
  lines.forEach((line, idx) => {
    // 匹配 URL
    const urlRegex = /(https?:\/\/[^\s，,。\n]+)/g;
    const urlMatches = line.match(urlRegex);

    if (urlMatches) {
      let lastIndex = 0;
      urlMatches.forEach((url, urlIdx) => {
        const urlIndex = line.indexOf(url, lastIndex);
        const beforeText = line.substring(lastIndex, urlIndex).trim();
        if (beforeText) {
          elements.push(
            <span key={`text-${idx}-${urlIdx}-before`} style={{ color: '#666', fontSize: '13px' }}>{beforeText} </span>
          );
        }
        elements.push(
          <a key={`link-${idx}-${urlIdx}`} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', fontSize: '13px', wordBreak: 'break-all' }}>
            {url}
          </a>
        );
        lastIndex = urlIndex + url.length;
      });
      if (lastIndex < line.length) {
        elements.push(
          <span key={`text-${idx}-after`} style={{ color: '#666', fontSize: '13px' }}> {line.substring(lastIndex).trim()}</span>
        );
      }
    } else {
      elements.push(
        <p key={`text-${idx}`} style={{ margin: '0 0 8px 0', color: '#666', fontSize: '13px', textAlign: 'left' }}>{line}</p>
      );
    }
  });

  return elements.length > 0 ? elements : [<span key="empty" style={{ color: '#999' }}>暂无搜索结果</span>];
}

interface NodeDetailPanelProps {
  node: KnowledgeNode | null;
  currentPath: KnowledgeNode[];
  onNodeClick: (nodeId: string) => void;
  onChildMessage: (message: string) => void;
  onEditQuestion?: (nodeId: string, newQuestion: string) => void;
  onReAnswer?: (nodeId: string) => void;
  isLoading: boolean;
  streamingAnswer?: string;
  isStreaming?: boolean;
  searchResults?: string | null;
  searchStructured?: Array<{title: string; link: string; snippet: string}>;
  searchLoading?: boolean;
  searchError?: string | null;
  searchDone?: boolean;
  // 知识库检索相关（RAG）
  kbResults?: Array<{content: string; score: number; fileName: string}>;
  kbLoading?: boolean;
  kbDone?: boolean;
  // 引用来源
  references?: {
    web: Array<{title: string; link: string; snippet: string}>;
    kb: Array<{content: string; score: number; fileName: string}>;
  };
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  currentPath,
  onNodeClick,
  onChildMessage,
  onEditQuestion,
  onReAnswer,
  isLoading,
  streamingAnswer = '',
  isStreaming = false,
  searchResults = null,
  searchStructured = [],
  searchLoading = false,
  searchError = null,
  searchDone = false,
  kbResults = [],
  kbLoading = false,
  kbDone = false,
  references = { web: [], kb: [] },
}) => {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [kbExpanded, setKbExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const input = e.target as HTMLInputElement;
      if (input.value.trim()) {
        onChildMessage(input.value.trim());
        input.value = '';
      }
    }
  };

  // 处理回答文本，将 [1]/[KB-1] 引用标记转为可点击的链接
  const rawAnswer = isStreaming ? streamingAnswer : node?.answer || '';
  const displayAnswer = rawAnswer.replace(
    /\[(KB-\d+|\d+)\]/g,
    (match, num) => {
      const isKB = String(num).startsWith('KB-');
      const refId = isKB ? `ref-kb-${String(num).replace('KB-', '')}` : `ref-web-${num}`;
      return `[${match}](#${refId})`;
    }
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#fff',
        borderLeft: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 面包屑导航 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {currentPath.map((pathNode, i) => (
          <span key={pathNode.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && (
              <span style={{ color: '#999', margin: '0 4px' }}>&gt;</span>
            )}
            <span
              onClick={() => onNodeClick(pathNode.id)}
              style={{
                color: pathNode.id === node?.id ? '#8B5CF6' : '#667eea',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '2px 4px',
                borderRadius: '3px',
                background: pathNode.id === node?.id ? '#eef2ff' : 'transparent',
              }}
            >
              {pathNode.question.length > 15
                ? pathNode.question.substring(0, 15) + '...'
                : pathNode.question}
            </span>
          </span>
        ))}
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px', textAlign: 'left' }}>
        {!node ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#999',
            }}
          >
            选择一个节点查看详情
          </div>
        ) : (
          <>
            {/* 问题（可编辑） */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3
                  style={{
                    fontSize: '12px',
                    color: '#667eea',
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  问题
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setIsEditing(true); setEditText(node.question); }}
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #e0e0e0', borderRadius: '4px', cursor: 'pointer', background: '#fff', color: '#666' }}
                    title="编辑问题"
                  >
                    ✏️ 编辑
                  </button>
                  <button
                    onClick={() => onReAnswer?.(node.id)}
                    disabled={isLoading}
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #e0e0e0', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', background: isLoading ? '#f0f0f0' : '#667eea', color: isLoading ? '#999' : '#fff', opacity: isLoading ? 0.6 : 1 }}
                    title="重新生成回答"
                  >
                    🔄 重新回答
                  </button>
                </div>
              </div>
              {isEditing ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                    style={{ width: '100%', minHeight: '60px', padding: '8px 12px', fontSize: '16px', fontWeight: 500, color: '#333', border: '1px solid #667eea', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={() => { onEditQuestion?.(node.id, editText); setIsEditing(false); onReAnswer?.(node.id); }}
                      style={{ padding: '6px 16px', fontSize: '13px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#667eea', color: '#fff' }}
                    >
                      保存并重新回答
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      style={{ padding: '6px 16px', fontSize: '13px', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#666' }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '16px', fontWeight: 500, color: '#333', textAlign: 'left', margin: 0 }}>
                  {node.question}
                </p>
              )}
            </div>

            {/* 综述（导入模式特有） */}
            {node.summary && !node.answer && (
              <div 
                style={{ 
                  marginBottom: '20px', 
                  padding: '16px', 
                  background: '#f8f9fa', 
                  borderRadius: '8px', 
                  borderLeft: '4px solid #667eea',
                  textAlign: 'left'
                }}
              >
                <h3
                  style={{
                    fontSize: '12px',
                    color: '#667eea',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  📖 综述
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#444', margin: 0 }}>
                  {node.summary}
                </p>
                {node.sourceFile && (
                  <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                    来源：{node.sourceFile}
                  </p>
                )}
              </div>
            )}

            {/* 回答 - 左对齐 */}
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <h3
                style={{
                  fontSize: '12px',
                  color: '#667eea',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                回答
              </h3>
              <div
                style={{
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: '#444',
                  textAlign: 'left',
                }}
                className="answer-content"
              >
                <ReactMarkdown
                  components={{
                    // 自定义链接渲染，引用链接用上标样式，外部链接常规样式
                    a: ({ href, children, ...props }) => {
                      const text = String(children);
                      const isRefLink = href?.startsWith('#ref-');
                      const isKBRef = text.includes('KB-');
                      
                      // 内部引用链接：上标徽章样式
                      if (isRefLink) {
                        return (
                          <a
                            href={href}
                            style={{
                              color: isKBRef ? '#16a34a' : '#2563eb',
                              fontWeight: 700,
                              fontSize: '0.75em',
                              verticalAlign: 'super',
                              textDecoration: 'none',
                              background: isKBRef ? '#f0fdf4' : '#eff6ff',
                              padding: '0 3px',
                              borderRadius: '3px',
                              border: `1px solid ${isKBRef ? '#bbf7d0' : '#bfdbfe'}`,
                            }}
                            title={isKBRef ? '跳转到知识库引用' : '跳转到网络引用'}
                          >
                            {children}
                          </a>
                        );
                      }
                      
                      // 外部链接
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#667eea',
                            textDecoration: 'underline'
                          }}
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                    // 自定义文本渲染，高亮KB引用标记
                    p: ({ children, ...props }) => {
                      return <p style={{ margin: '0 0 8px 0' }} {...props}>{children}</p>;
                    }
                  }}
                >
                  {displayAnswer}
                </ReactMarkdown>
                {isStreaming && (
                  <span style={{ color: '#8B5CF6', animation: 'blink 1s step-end infinite' }}>
                    ▍
                  </span>
                )}
              </div>
            </div>

            {/* 关键概念 */}
            {node.concepts.length > 0 && !node.isStreamed && (
              <div style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    fontSize: '12px',
                    color: '#667eea',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  关键概念
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {node.concepts.map((concept, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#eef2ff',
                        color: '#667eea',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        fontSize: '13px',
                      }}
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 📎 引用来源 */}
            {!isStreaming && (references.web.length > 0 || references.kb.length > 0) && (
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                background: '#fafafa',
                borderRadius: '8px',
                border: '1px solid #e8e8e8'
              }}>
                <h3 style={{
                  fontSize: '13px',
                  color: '#333',
                  marginBottom: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  📎 引用来源
                </h3>

                {/* 知识库引用 */}
                {references.kb.length > 0 && (
                  <div style={{ marginBottom: references.web.length > 0 ? '16px' : '0' }}>
                    <div style={{
                      fontSize: '11px',
                      color: '#16a34a',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      📚 知识库 ({references.kb.length})
                    </div>
                    {references.kb.map((ref, i) => (
                      <div key={i} id={`ref-kb-${i + 1}`} style={{
                        fontSize: '12px',
                        padding: '8px 12px',
                        background: '#f0fdf4',
                        borderLeft: '3px solid #16a34a',
                        borderRadius: '4px',
                        marginBottom: '6px'
                      }}>
                        <div style={{ color: '#166534', fontWeight: 500, marginBottom: '4px' }}>
                          [KB-{i + 1}] {ref.fileName || '知识库文档'}
                        </div>
                        {ref.content && (
                          <div style={{
                            color: '#444',
                            lineHeight: 1.5,
                            maxHeight: '80px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {ref.content.length > 200
                              ? ref.content.substring(0, 200) + '...'
                              : ref.content
                            }
                          </div>
                        )}
                        {ref.score !== undefined && (
                          <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                            相关度: {(ref.score * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 网络搜索引用 */}
                {references.web.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '11px',
                      color: '#2563eb',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      🌐 网络搜索 ({references.web.length})
                    </div>
                    {references.web.map((ref, i) => (
                      <div key={i} id={`ref-web-${i + 1}`} style={{
                        fontSize: '12px',
                        padding: '8px 12px',
                        background: '#eff6ff',
                        borderLeft: '3px solid #2563eb',
                        borderRadius: '4px',
                        marginBottom: '6px'
                      }}>
                        <div style={{ marginBottom: '4px' }}>
                          [{i + 1}]{' '}
                          {ref.link ? (
                            <a
                              href={ref.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#2563eb',
                                fontWeight: 500,
                                textDecoration: 'none'
                              }}
                              title={ref.link}
                            >
                              {ref.title || ref.link}
                            </a>
                          ) : (
                            <span style={{ color: '#1e40af', fontWeight: 500 }}>{ref.title || '未知来源'}</span>
                          )}
                        </div>
                        {ref.snippet && (
                          <div style={{
                            color: '#666',
                            lineHeight: 1.5,
                            maxHeight: '60px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '11px'
                          }}>
                            {ref.snippet.length > 200
                              ? ref.snippet.substring(0, 200) + '...'
                              : ref.snippet
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 联网搜索结果 - 默认收起，搜索完成后始终显示 */}
            {(searchDone || searchResults || searchLoading || searchError) && (
              <div style={{ marginBottom: '20px', borderTop: '1px solid #e0e0e0', paddingTop: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    padding: '8px 0',
                  }}
                  onClick={() => setSearchExpanded(!searchExpanded)}
                >
                  <h3
                    style={{
                      fontSize: '12px',
                      color: '#667eea',
                      margin: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    🔍 联网检索
                    {searchLoading && <span style={{ fontSize: '11px', color: '#999' }}>搜索中...</span>}
                    {searchError && <span style={{ fontSize: '11px', color: '#e53e3e' }}>搜索失败</span>}
                  </h3>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    {searchExpanded ? '▲ 收起' : '▼ 展开'}
                  </span>
                </div>

                {searchExpanded && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: '#f8f9fa',
                      borderRadius: '8px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#666',
                      maxHeight: '300px',
                      overflow: 'auto',
                      textAlign: 'left',
                    }}
                  >
                    {searchError ? (
                      <span style={{ color: '#e53e3e' }}>检索失败：{searchError}</span>
                    ) : searchStructured && searchStructured.length > 0 ? (
                      <div>
                        {searchStructured.map((item, idx) => (
                          <div key={`search-${idx}`} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: idx < searchStructured.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
                            {item.title && (
                              <a 
                                href={item.link || '#'} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ color: '#667eea', fontSize: '14px', fontWeight: 500, display: 'block', marginBottom: '4px', textDecoration: 'none' }}
                              >
                                {item.title} 🔗
                              </a>
                            )}
                            {item.snippet && (
                              <p style={{ margin: '0', color: '#666', fontSize: '13px', lineHeight: 1.5 }}>{item.snippet}</p>
                            )}
                            {item.link && !item.title && (
                              <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', fontSize: '13px' }}>
                                {item.link}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : searchResults ? (
                      <div style={{ textAlign: 'left' }}>
                        {parseSearchResultsAsLinks(searchResults)}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>正在检索...</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 知识库检索结果（RAG） - 默认收起 */}
            {(kbDone || kbLoading) && kbResults.length > 0 && (
              <div style={{ marginBottom: '20px', borderTop: '1px solid #e0e0e0', paddingTop: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    padding: '8px 0',
                  }}
                  onClick={() => setKbExpanded(!kbExpanded)}
                >
                  <h3
                    style={{
                      fontSize: '12px',
                      color: '#10b981',
                      margin: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    📚 知识库检索
                    {kbLoading && <span style={{ fontSize: '11px', color: '#999' }}>检索中...</span>}
                  </h3>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    {kbExpanded ? '▲ 收起' : '▼ 展开'}
                  </span>
                </div>

                {kbExpanded && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: '#f0fdf4',
                      borderRadius: '8px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#666',
                      maxHeight: '300px',
                      overflow: 'auto',
                      textAlign: 'left',
                    }}
                  >
                    {kbResults.map((result, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: idx < kbResults.length - 1 ? '12px' : 0,
                          paddingBottom: idx < kbResults.length - 1 ? '12px' : 0,
                          borderBottom: idx < kbResults.length - 1 ? '1px solid #d1fae5' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                            #{idx + 1}
                          </span>
                          <span style={{ fontSize: '12px', color: '#666' }}>{result.fileName}</span>
                          <span style={{ fontSize: '11px', color: '#999' }}>相似度: {Math.round(result.score * 100)}%</span>
                        </div>
                        <p style={{ margin: 0, color: '#444', lineHeight: 1.6 }}>{result.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 追问输入 */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid #e0e0e0',
              }}
            >
              <input
                type="text"
                placeholder="继续追问..."
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  textAlign: 'left',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#667eea')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
