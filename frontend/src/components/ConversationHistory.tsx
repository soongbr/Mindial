import React, { useState } from 'react';

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  currentConversationId: string | null;
  conversations: Conversation[];
  loading?: boolean;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  isOpen,
  onClose,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  currentConversationId,
  conversations,
  loading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 过滤搜索结果
  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 点击遮罩关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 处理删除确认
  const handleDeleteConfirm = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleDeleteExecute = (id: string) => {
    onDeleteConversation(id);
    setDeleteConfirmId(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 1000,
        }}
        onClick={handleBackdropClick}
      >
        {/* 下拉面板 */}
        <div
          style={{
            position: 'absolute',
            top: 50,
            left: 10,
            width: 320,
            maxHeight: 'calc(100vh - 120px)',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 头部：搜索 + 新对话 */}
          <div
            style={{
              padding: 16,
              borderBottom: '1px solid #e0e0e0',
              background: '#fafafa',
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="搜索历史对话..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: 6,
                  fontSize: 14,
                  outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#667eea'}
                onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              />
              <button
                onClick={onNewConversation}
                style={{
                  padding: '8px 16px',
                  background: '#667eea',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#5568d3'}
                onMouseLeave={e => e.currentTarget.style.background = '#667eea'}
              >
                新对话
              </button>
            </div>
          </div>

          {/* 对话列表 */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 8,
            }}
          >
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
                加载中...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                {searchQuery ? '没有找到匹配的对话' : '暂无历史对话'}
              </div>
            ) : (
              filteredConversations.map(conv => (
                <div
                  key={conv.id}
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 8,
                    background: conv.id === currentConversationId ? '#eef2ff' : '#fff',
                    border: conv.id === currentConversationId ? '2px solid #667eea' : '2px solid transparent',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => onSelectConversation(conv.id)}
                  onMouseEnter={e => {
                    if (conv.id !== currentConversationId) {
                      e.currentTarget.style.background = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={e => {
                    if (conv.id !== currentConversationId) {
                      e.currentTarget.style.background = '#fff';
                    }
                  }}
                >
                  {/* 标题 */}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#333',
                      marginBottom: 4,
                      paddingRight: 24,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {conv.title}
                  </div>
                  
                  {/* 时间 */}
                  <div
                    style={{
                      fontSize: 12,
                      color: '#999',
                    }}
                  >
                    {formatTime(conv.updatedAt)}
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteConfirm(conv.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 24,
                      height: 24,
                      border: 'none',
                      background: 'transparent',
                      color: '#999',
                      cursor: 'pointer',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      opacity: deleteConfirmId === conv.id ? 1 : 0.6,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#ffebee';
                      e.currentTarget.style.color = '#f44336';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#999';
                    }}
                  >
                    {deleteConfirmId === conv.id ? '⚠️' : '×'}
                  </button>

                  {/* 删除确认 */}
                  {deleteConfirmId === conv.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 36,
                        right: 0,
                        background: '#fff',
                        border: '1px solid #e0e0e0',
                        borderRadius: 6,
                        padding: 8,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        zIndex: 10,
                        minWidth: 120,
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                        确认删除该对话？
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteExecute(conv.id);
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            background: '#f44336',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          删除
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            background: '#e0e0e0',
                            color: '#333',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ConversationHistory;
