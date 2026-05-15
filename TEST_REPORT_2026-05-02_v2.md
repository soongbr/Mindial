# 培养基 - 知识树显示问题测试报告（第二轮）

**测试时间**：2026-05-02 01:13
**测试版本**：v0.1
**测试人员**：面面 🐱

---

## 一、问题描述

用户反馈：**左侧的知识树并不能准确显示我追问过的历史问题**

---

## 二、分析过程

### 2.1 当前数据状态检查

检查 `backend/data/knowledge-tree.json`：

| 节点ID | 问题 | 父节点 | children数组 |
|--------|------|--------|-------------|
| gd6p8mzmwx | ai和大语言模型的基础知识 | null | **空 []** ❌ |
| i4elsu9wpt | 那么，大语言模型有什么核心技术 | gd6p8mzmwx | [] |
| hf3c5g02ka6 | llm | gd6p8mzmwx | [] |

**发现**：根节点 `gd6p8mzmwx` 的 `children` 数组为空，导致子节点没有在树上显示！

### 2.2 根因分析

检查 `frontend/src/App.tsx` 中的 `handleChildMessage` 函数（约第 250 行）：

**问题代码段**：
```javascript
setTree(prev => {
  const parent = prev.nodes[parentId];
  if (!parent) return prev;

  const newNodes = {
    ...prev.nodes,
    [childId]: childNode,
    [parentId]: {
      ...parent,
      children: [...parent.children, childNode],  // 更新父节点的children
    },
  };

  return {
    ...prev,
    nodes: newNodes,
    currentNodeId: childId,
  };
});

// ... 流式处理结束 ...

// ❌ 问题在这里：用闭包中的 tree 变量（旧的）来构建 updatedTree
const updatedTree = {
  ...tree,  // <-- 这是闭包开始时的旧 tree，不是 setTree 后的新状态
  nodes: {
    ...tree.nodes,
    [childId]: { ...childNode, answer: finalAnswer, concepts, isStreamed: false },
  },
};

setTree(updatedTree);
saveTree(updatedTree);  // <-- 保存的是旧状态，父节点的 children 没有被更新
```

**根因**：闭包变量 `tree` 在 `handleChildMessage` 开始时被捕获，`setTree` 调用正确更新了状态，但最后 `saveTree` 时用的是旧 `tree`，导致父节点的 `children` 数组没有包含新创建的子节点。

---

## 三、已发现的问题汇总

| ID | 严重度 | 问题 | 代码位置 | 影响 |
|----|--------|------|---------|------|
| BUG-001 | 🔴 高 | 左侧树在选中节点下显示回答预览 | TreeNode.tsx:21-24 | 左侧树信息冗余 |
| BUG-002 | 🔴 高 | 追问后父节点的children数组未更新 | App.tsx:handleChildMessage | **知识树无法显示追问的历史** |

---

## 四、BUG-002 修复建议

**文件**：`frontend/src/App.tsx`
**函数**：`handleChildMessage`（约第 250 行）

**方案**：在 `setTree` 的回调中立即保存树，而不是在外部用闭包中的旧变量

**当前代码**（有问题）：
```javascript
setTree(prev => {
  // ... 更新 nodes ...
  return newTree;
});
// ... 流式结束 ...
const updatedTree = {
  ...tree,  // ❌ 旧变量
  nodes: { ...tree.nodes, [childId]: ... },
};
setTree(updatedTree);
saveTree(updatedTree);  // ❌ 保存的是旧状态
```

**修复后**：
```javascript
setTree(prev => {
  const parent = prev.nodes[parentId];
  if (!parent) return prev;

  const newNodes = {
    ...prev.nodes,
    [childId]: childNode,
    [parentId]: {
      ...parent,
      children: [...parent.children, childNode],
    },
  };

  const newTree = {
    ...prev,
    nodes: newNodes,
    currentNodeId: childId,
  };

  // ✅ 在 setTree 回调中立即保存，使用回调参数 prev 确保是最新状态
  saveTree(newTree);
  
  return newTree;
});
// 流式结束后不再需要额外的 setTree + saveTree
```

**或者**：流式结束后只更新子节点状态，不重新构建整个树：
```javascript
// 流式结束后直接更新子节点，不触碰父节点的 children
setTree(prev => ({
  ...prev,
  nodes: {
    ...prev.nodes,
    [childId]: { ...prev.nodes[childId], answer: finalAnswer, concepts, isStreamed: false },
  },
}));
```

---

## 五、测试结论

**结论**：❌ 需要修复 BUG-001 和 BUG-002

**优先级**：
1. **BUG-002**（知识树不显示追问历史）- 必须优先修复
2. **BUG-001**（左侧树显示回答预览）- 可后续修复

---

## 六、修复后验证步骤

1. 输入主题「AI基础知识」→ 创建根节点
2. 追问「LLM是什么」→ 创建子节点
3. 刷新页面 → 检查知识树是否正确显示根节点和子节点

---

报告已保存到：`D:\培养基\TEST_REPORT_2026-05-02.md`

请程序员先修复 BUG-002（父节点children未更新问题），完成后通知再次测试喵～ 🐱