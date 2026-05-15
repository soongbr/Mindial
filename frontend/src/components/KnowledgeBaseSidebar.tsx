import React, { useState, useEffect } from 'react';

interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: number;
  hasMindMap: boolean;
  conversationId: string | null;
  status: string;
}

interface KnowledgeBaseSidebarProps {
  apiBase: string;
  token: string;
  onGenerateMindMap: (documentId: string) => void;
  generatingDocumentId: string | null;
  onUploadClick: () => void;
  currentMode: 'explore' | 'learn';
  onModeChange: (mode: 'explore' | 'learn') => void;
  selectedDocumentIds: string[];
  onDocumentSelect: (documentId: string, selected: boolean) => void;
}

const KnowledgeBaseSidebar: React.FC<KnowledgeBaseSidebarProps> = ({
  apiBase,
  token,
  onGenerateMindMap,
  generatingDocumentId,
  onUploadClick,
  currentMode,
  onModeChange,
  selectedDocumentIds = [],
  onDocumentSelect
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 切换文档选中状态
  const handleToggleSelect = (docId: string, checked: boolean) => {
    if (typeof onDocumentSelect === 'function') {
      onDocumentSelect(docId, checked);
    }
  };

  // 加载文档列表
  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/knowledge/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setDocuments(data.documents || []);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError('加载文档列表失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, token]);

  // 删除文档
  const handleDelete = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？删除后关联的导图也会被删除。')) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/knowledge/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setDocuments(docs => docs.filter(d => d.id !== docId));
      } else {
        alert(data.error || '删除失败');
      }
    } catch (err) {
      alert('删除失败');
      console.error(err);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 格式化时间
  const formatDate = (timestamp: number) => {
    if (!timestamp || isNaN(timestamp)) return '未知时间';
    try {
      return new Date(timestamp).toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '未知时间';
    }
  };

  return (
    <div style={{
      width: '240px',
      minWidth: '180px',
      height: '100%',
      background: '#fafafa',
      borderRight: '1px solid #e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* 头部 */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e0e0e0',
        background: '#fff'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            📚 我的知识库
          </h3>
        </div>

        {/* 模式切换 */}
        <div style={{
          display: 'flex',
          gap: '8px',
          fontSize: '12px'
        }}>
          <button
            onClick={() => onModeChange('explore')}
            style={{
              flex: 1,
              padding: '6px 8px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: currentMode === 'explore' ? 600 : 400,
              background: currentMode === 'explore' ? '#667eea' : '#f0f0f0',
              color: currentMode === 'explore' ? '#fff' : '#666'
            }}
          >
            🔍 自由探索
          </button>
          <button
            onClick={() => onModeChange('learn')}
            style={{
              flex: 1,
              padding: '6px 8px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: currentMode === 'learn' ? 600 : 400,
              background: currentMode === 'learn' ? '#667eea' : '#f0f0f0',
              color: currentMode === 'learn' ? '#fff' : '#666'
            }}
          >
            📚 目标学习
          </button>
        </div>
      </div>

      {/* 文档列表 */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px'
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            加载中...
          </div>
        )}

        {error && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: '#e53935',
            fontSize: '14px'
          }}>
            {error}
            <button
              onClick={loadDocuments}
              style={{
                display: 'block',
                margin: '8px auto 0',
                padding: '4px 12px',
                background: '#f0f0f0',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && documents.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#999',
            fontSize: '14px'
          }}>
            还没有上传过文档<br/>
            <span style={{ fontSize: '12px' }}>点击上方按钮上传文档</span>
          </div>
        )}

        {!loading && !error && Array.isArray(documents) && documents.length > 0 && documents.map(doc => (
          <div
            key={doc.id || Math.random().toString(36)}
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              border: '1px solid #e8e8e8'
            }}
          >
            {/* 文件名 */}
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#333',
              marginBottom: currentMode === 'explore' ? '8px' : '6px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {/* 两种模式都显示勾选框 */}
              <input
                type="checkbox"
                checked={Array.isArray(selectedDocumentIds) && selectedDocumentIds.includes(doc.id)}
                onChange={(e) => handleToggleSelect(doc.id, e.target.checked)}
                style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }}
                title={currentMode === 'explore' ? '选为知识库参考' : '选入目标学习组合'}
              />
              📄 {doc.fileName || '未知文件'}
            </div>

            {/* 文件信息 */}
            <div style={{
              fontSize: '11px',
              color: '#999',
              marginBottom: '8px'
            }}>
              {formatFileSize(doc.fileSize || 0)} · {formatDate(doc.uploadedAt)}
            </div>

            {/* 操作按钮 */}
            <div style={{
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap'
            }}>
              {currentMode === 'learn' && (
                <button
                  onClick={() => onGenerateMindMap(doc.id)}
                  disabled={generatingDocumentId === doc.id || doc.hasMindMap}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: generatingDocumentId === doc.id || doc.hasMindMap
                      ? 'not-allowed'
                      : 'pointer',
                    background: doc.hasMindMap
                      ? '#4caf50'
                      : generatingDocumentId === doc.id
                        ? '#e0e0e0'
                        : '#667eea',
                    color: doc.hasMindMap || generatingDocumentId === doc.id ? '#fff' : '#fff',
                    opacity: generatingDocumentId === doc.id && !doc.hasMindMap ? 0.8 : 1
                  }}
                >
                  {generatingDocumentId === doc.id
                    ? '⏳ 生成中...'
                    : doc.hasMindMap
                      ? '✅ 已生成导图'
                      : '🎯 生成导图'}
                </button>
              )}

              <button
                onClick={() => handleDelete(doc.id)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: '#fff',
                  color: '#666'
                }}
              >
                🗑️ 删除
              </button>
            </div>

            {/* 状态标签 */}
            {doc.hasMindMap && (
              <div style={{
                marginTop: '6px',
                fontSize: '10px',
                color: '#4caf50'
              }}>
                ✨ 已导入思维导图
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部操作区 */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid #e0e0e0',
        background: '#fff'
      }}>
        {/* 目标学习模式：选中2个以上文档时显示组合学习按钮 */}
        {currentMode === 'learn' && Array.isArray(selectedDocumentIds) && selectedDocumentIds.length >= 2 && (
          <button
            onClick={() => onGenerateMindMap(selectedDocumentIds.join(','))}
            disabled={!!generatingDocumentId}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: generatingDocumentId ? '#e0e0e0' : '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: generatingDocumentId ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginBottom: '8px',
              opacity: generatingDocumentId ? 0.7 : 1
            }}
          >
            {generatingDocumentId && generatingDocumentId.includes(',') ? '⏳ 生成中...' : `📚 组合学习 (${selectedDocumentIds.length}个文档)`}
          </button>
        )}
        <button
          onClick={onUploadClick}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: '#667eea',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          📤 上传文档
        </button>
      </div>
    </div>
  );
};

export default KnowledgeBaseSidebar;
