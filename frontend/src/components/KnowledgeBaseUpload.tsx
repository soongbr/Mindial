import React, { useState, useRef } from 'react';

interface KnowledgeBaseUploadProps {
  onSuccess: (document: any) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  apiBase: string;
  token: string;
}

const KnowledgeBaseUpload: React.FC<KnowledgeBaseUploadProps> = ({
  onSuccess,
  onError,
  onCancel,
  apiBase,
  token,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;

    // 检查文件大小 (50MB，与后端 multer 配置一致)
    if (file.size > 50 * 1024 * 1024) {
      onError('文件大小不能超过 50MB');
      return;
    }

    // 检查文件类型
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/markdown',
      'text/plain',
    ];
    const allowedExts = ['.pdf', '.docx', '.doc', '.md', '.markdown', '.txt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      onError('不支持的文件格式，请上传 PDF、DOCX、Markdown 或 TXT 文件');
      return;
    }

    setIsUploading(true);
    setUploadProgress('正在解析文档...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setUploadProgress('正在上传并分析文档结构...');
      
      const response = await fetch(`${apiBase}/knowledge/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }

      setUploadProgress('正在保存文档...');

      if (data.success) {
        // 上传成功，返回文档信息
        onSuccess(data.document);
      } else {
        throw new Error(data.error || '上传失败');
      }
    } catch (err) {
      console.error('Upload error:', err);
      onError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#333' }}>
          📚 导入知识库
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
          上传文档后，AI 会自动分析结构并生成思维导图
        </p>

        {/* 支持格式 */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: '#999', margin: '0 0 8px 0' }}>
            支持格式：PDF、DOCX、Markdown、TXT（最大 50MB）
          </p>
        </div>

        {/* 上传区域 */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? '#667eea' : '#e0e0e0'}`,
            borderRadius: '12px',
            padding: '40px 20px',
            textAlign: 'center',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            background: dragActive ? '#f8f9ff' : '#fafafa',
            transition: 'all 0.2s',
            marginBottom: '20px',
          }}
        >
          {isUploading ? (
            <div>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
              <p style={{ margin: 0, color: '#667eea', fontSize: '14px' }}>
                {uploadProgress}
              </p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>
                拖拽文件到此处，或点击选择文件
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
                或者把文件拖到输入框上方
              </p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.md,.markdown,.txt"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />

        {/* 按钮 */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isUploading}
            style={{
              padding: '10px 20px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              background: '#fff',
              color: '#666',
              fontSize: '14px',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.6 : 1,
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseUpload;
