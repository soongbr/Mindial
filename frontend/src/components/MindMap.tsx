import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import MindMapNode from './MindMapNode';
import type { KnowledgeTree } from '../types';

interface MindMapProps {
  tree: KnowledgeTree;
  onNodeClick: (nodeId: string) => void;
  collapsedNodeIds: string[];
}

const nodeTypes = {
  mindMapNode: MindMapNode,
};

const MindMap: React.FC<MindMapProps> = ({
  tree,
  onNodeClick,
  collapsedNodeIds,
}) => {
  // 使用 React Flow 内置的 useNodesState 和 useEdgesState
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // 构建节点和边
  const { newNodes, newEdges } = useMemo(() => {
    if (!tree.rootId) return { newNodes: [], newEdges: [] };

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const visited = new Set<string>();

    const HORIZONTAL_SPACING = 280;
    const VERTICAL_SPACING = 100;

    // ====== 第一遍：计算每个节点的"子树叶子数"（用于按比例分配垂直空间） ======
    const leafCounts = new Map<string, number>();

    function computeLeafCount(nodeId: string): number {
      if (leafCounts.has(nodeId)) return leafCounts.get(nodeId)!;

      const node = tree.nodes[nodeId];
      if (!node) { leafCounts.set(nodeId, 1); return 1; }

      const isCollapsed = collapsedNodeIds.includes(nodeId);
      const validChildren = isCollapsed
        ? []
        : node.children.filter((cid: string) => tree.nodes[cid]);

      if (validChildren.length === 0) {
        leafCounts.set(nodeId, 1);
        return 1;
      }

      let total = 0;
      for (const childId of validChildren) {
        total += computeLeafCount(childId);
      }
      leafCounts.set(nodeId, Math.max(total, 1));
      return leafCounts.get(nodeId)!;
    }

    computeLeafCount(tree.rootId);

    // ====== 第二遍：BFS 布局，按叶子数比例分配垂直空间 ======
    const rootNode = tree.nodes[tree.rootId];
    if (!rootNode) return { newNodes: [], newEdges: [] };

    const rootLeafCount = leafCounts.get(tree.rootId) || 1;
    const rootAreaHeight = rootLeafCount * VERTICAL_SPACING;
    const startY0 = Math.max(rootAreaHeight / 2 + 50, 200);

    const queue: { nodeId: string; x: number; y: number; level: number }[] = [];
    queue.push({ nodeId: tree.rootId, x: 50, y: startY0, level: 0 });

    while (queue.length > 0) {
      const { nodeId, x, y, level } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = tree.nodes[nodeId];
      if (!node) continue;

      const isCollapsed = collapsedNodeIds.includes(nodeId);
      const levelColors = ['#E8D5F5', '#D5E8F5', '#D5F5E8', '#F5F5DC'];
      const colors = levelColors[Math.min(level, 3)];
      const borderRadius = level === 0 ? '16px' : '12px';

      newNodes.push({
        id: nodeId,
        type: 'mindMapNode',
        position: { x, y },
        data: {
          node,
          isSelected: tree.currentNodeId === nodeId,
          level,
        },
        style: {
          background: colors,
          border:
            tree.currentNodeId === nodeId
              ? '2px solid #8B5CF6'
              : `1px solid ${colors}`,
          borderRadius,
          padding: '10px 14px',
          minWidth: '120px',
          maxWidth: '220px',
          fontSize: '13px',
          boxShadow:
            tree.currentNodeId === nodeId
              ? '0 0 0 3px rgba(139, 92, 246, 0.2)'
              : '0 2px 8px rgba(0,0,0,0.1)',
        },
      });

      if (!isCollapsed && node.children.length > 0) {
        const validChildren = node.children.filter(
          (cid: string) => tree.nodes[cid] && !visited.has(cid)
        );

        if (validChildren.length > 0) {
          // 计算所有子节点的总叶子数
          let totalLeafs = 0;
          const childLeafCounts: number[] = [];
          for (const childId of validChildren) {
            const lc = leafCounts.get(childId) || 1;
            childLeafCounts.push(lc);
            totalLeafs += lc;
          }

          // 总高度 = 总叶子数 × 垂直间距
          const totalHeight = totalLeafs * VERTICAL_SPACING;
          const startY = y - totalHeight / 2;

          let currentY = startY;
          for (let i = 0; i < validChildren.length; i++) {
            const childId = validChildren[i];
            const lc = childLeafCounts[i];
            const childAllocatedHeight = lc * VERTICAL_SPACING;
            const childY = currentY + childAllocatedHeight / 2;
            const childX = x + HORIZONTAL_SPACING;

            newEdges.push({
              id: `${nodeId}-${childId}`,
              source: nodeId,
              target: childId,
              type: 'smoothstep',
              style: { stroke: colors, strokeWidth: 2 },
              animated: !!tree.nodes[childId]?.isStreamed,
            });

            queue.push({
              nodeId: childId,
              x: childX,
              y: childY,
              level: level + 1,
            });

            currentY += childAllocatedHeight;
          }
        }
      }
    }

    return { newNodes, newEdges };
  }, [tree, collapsedNodeIds]);

  // 当节点或边变化时更新状态
  React.useEffect(() => {
    setNodes(newNodes);
    setEdges(newEdges);
  }, [newNodes, newEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  // 只有在没有根节点时才显示空状态
  if (!tree.rootId) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: '14px',
        }}
      >
        输入主题开始探索
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#8B5CF6', strokeWidth: 2 },
        }}
      >
        <Controls />
        <Background color="#f0f0f0" gap={20} />
      </ReactFlow>
    </div>
  );
};

export default MindMap;