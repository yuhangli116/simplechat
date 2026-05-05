import { Node, Edge, Position } from 'reactflow';

const CONTENT_WRAP_CHARS = 18;

const countWrappedLines = (text: string, charsPerLine: number) => {
  if (!text) return 0;
  return text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
};

const getNodeSize = (node: Node) => {
  const renderedWidth = (node as Node & { width?: number }).width;
  const renderedHeight = (node as Node & { height?: number }).height;

  if (typeof renderedWidth === 'number' && renderedWidth > 0 && typeof renderedHeight === 'number' && renderedHeight > 0) {
    return { width: renderedWidth, height: renderedHeight };
  }

  const label = typeof node.data?.label === 'string' ? node.data.label : '';
  const content = typeof node.data?.content === 'string' ? node.data.content : '';

  const widthChars = Math.max(label.length, Math.min(content.length, CONTENT_WRAP_CHARS * 2));
  const estimatedWidth = Math.min(240, Math.max(78, widthChars * 8 + 22));

  const labelLines = Math.max(1, countWrappedLines(label, 12));
  const contentLines = content ? countWrappedLines(content, CONTENT_WRAP_CHARS) : 0;
  const estimatedHeight = 22 + labelLines * 14 + contentLines * 13;

  return { width: estimatedWidth, height: estimatedHeight };
};

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR'): { nodes: Node[], edges: Edge[] } => {
  const isHorizontal = direction === 'LR';
  const sizeMap = new Map<string, { width: number; height: number }>();

  nodes.forEach((node) => {
    const size = getNodeSize(node);
    sizeMap.set(node.id, size);
  });

  // Build tree relationships
  const inDegree = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    if (!childrenMap.has(n.id)) {
      childrenMap.set(n.id, []);
    }
  });

  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    if (!childrenMap.has(e.source)) {
      childrenMap.set(e.source, []);
    }
    childrenMap.get(e.source)?.push(e.target);
  });

  const roots = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);

  // Calculate depths for rank-based X alignment
  const depths = new Map<string, number>();
  const calculateDepths = (nodeId: string, currentDepth: number) => {
    depths.set(nodeId, currentDepth);
    const children = childrenMap.get(nodeId) || [];
    children.forEach(childId => calculateDepths(childId, currentDepth + 1));
  };
  roots.forEach(rootId => calculateDepths(rootId, 0));

  const HORIZONTAL_SPACING = 72;
  const VERTICAL_SPACING = 32;

  const subtreeHeightMap = new Map<string, number>();

  // 1. Calculate subtree height for each node (bottom-up)
  const calculateSubtreeHeight = (nodeId: string): number => {
    const children = childrenMap.get(nodeId) || [];
    const nodeHeight = sizeMap.get(nodeId)?.height || 40;
    
    if (children.length === 0) {
      subtreeHeightMap.set(nodeId, nodeHeight);
      return nodeHeight;
    }
    
    let totalChildrenHeight = 0;
    children.forEach((childId, index) => {
      totalChildrenHeight += calculateSubtreeHeight(childId);
      if (index > 0) totalChildrenHeight += VERTICAL_SPACING;
    });
    
    // When aligning a single child horizontally with the parent,
    // the required height might need to be max(nodeHeight, childSubtreeHeight).
    const height = Math.max(nodeHeight, totalChildrenHeight);
    subtreeHeightMap.set(nodeId, height);
    return height;
  };

  roots.forEach(rootId => calculateSubtreeHeight(rootId));

  const nodePositions = new Map<string, {x: number, y: number}>();

  // 2. Assign positions top-down
  const assignPositions = (nodeId: string, x: number, yCenter: number) => {
    const nodeHeight = sizeMap.get(nodeId)?.height || 40;
    const nodeWidth = sizeMap.get(nodeId)?.width || 108;
    
    nodePositions.set(nodeId, {
      x: x,
      y: yCenter - nodeHeight / 2
    });
    
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) return;
    
    let totalChildrenHeight = 0;
    children.forEach((childId, index) => {
      totalChildrenHeight += subtreeHeightMap.get(childId) || 0;
      if (index > 0) totalChildrenHeight += VERTICAL_SPACING;
    });
    
    // Calculate currentY so that the single child aligns horizontally with its parent.
    // If there are multiple children, the children block is vertically centered relative to parent's yCenter.
    let currentY = yCenter - totalChildrenHeight / 2;
    const childX = x + nodeWidth + HORIZONTAL_SPACING;
    
    children.forEach(childId => {
      const childSubtreeHeight = subtreeHeightMap.get(childId) || 0;
      
      // If this is the ONLY child, we force it to share the exact same yCenter as the parent.
      // This ensures the straight line connects perfectly horizontally.
      const childCenterY = children.length === 1 ? yCenter : currentY + childSubtreeHeight / 2;
      
      assignPositions(childId, childX, childCenterY);
      currentY += childSubtreeHeight + VERTICAL_SPACING;
    });
  };

  // Layout multiple roots vertically
  let currentRootY = 0;
  roots.forEach((rootId, index) => {
    const rootSubtreeHeight = subtreeHeightMap.get(rootId) || 0;
    if (index > 0) currentRootY += VERTICAL_SPACING;
    const rootCenterY = currentRootY + rootSubtreeHeight / 2;
    assignPositions(rootId, 0, rootCenterY);
    currentRootY += rootSubtreeHeight;
  });

  // 3. Apply positions
  const layoutedNodes = nodes.map(node => {
    const pos = nodePositions.get(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: pos
    };
  });

  return { nodes: layoutedNodes, edges };
};
