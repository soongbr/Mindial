import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { KnowledgeNode } from '../types';

interface MindMapNodeProps extends NodeProps {
  data: {
    node: KnowledgeNode;
    isSelected: boolean;
    level: number;
  };
}

const MindMapNode: React.FC<MindMapNodeProps> = memo(({ data }) => {
  const { node, isSelected, level } = data;

  // 层级背景色（PRD 2.2 表格）
  const levelColors: Record<number, { bg: string; border: string }> = {
    0: { bg: '#E8D5F5', border: '#E8D5F5' }, // 根节点 - 淡紫色
    1: { bg: '#D5E8F5', border: '#D5E8F5' }, // 一级 - 淡蓝色
    2: { bg: '#D5F5E8', border: '#D5F5E8' }, // 二级 - 淡绿色
  };

  // 默认淡黄色
  const colors = levelColors[level] || { bg: '#F5F5DC', border: '#F5F5DC' };
  const borderRadius = level === 0 ? '16px' : '12px';

  // 省略过长文字（放宽截断阈值，配合更宽的节点）
  const displayQuestion = node.question.length > 30
    ? node.question.substring(0, 30) + '...'
    : node.question;

  return (
    <div
      style={{
        position: 'relative',
        background: colors.bg,
        border: isSelected ? '2px solid #8B5CF6' : `1px solid ${colors.border}`,
        borderRadius: borderRadius,
        padding: '10px 14px',
        minWidth: '140px',
        maxWidth: '240px',
        cursor: 'pointer',
        fontSize: '13px',
        boxShadow: isSelected ? '0 0 0 3px rgba(139, 92, 246, 0.2)' : '0 2px 8px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#8B5CF6', width: 8, height: 8 }}
      />

      {/* 流式指示器 */}
      {node.isStreamed && (
        <span style={{ color: '#8B5CF6', animation: 'pulse 1s infinite' }}>...</span>
      )}

      <div style={{ fontWeight: 500, color: '#333' }}>
        {displayQuestion}
      </div>

      {/* 悬停显示完整文字 */}
      {node.question.length > 30 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#333',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
          className="node-tooltip"
        >
          {node.question}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#8B5CF6', width: 8, height: 8 }}
      />
    </div>
  );
});

MindMapNode.displayName = 'MindMapNode';

export default MindMapNode;