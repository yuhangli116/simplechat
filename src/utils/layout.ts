import { Node, Edge, Position } from 'reactflow';
import dagre from 'dagre';

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

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 32,
    ranksep: 72,
  });

  const sizeMap = new Map<string, { width: number; height: number }>();

  nodes.forEach((node) => {
    const size = getNodeSize(node);
    sizeMap.set(node.id, size);
    dagreGraph.setNode(node.id, size);
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const { width, height } = sizeMap.get(node.id) || { width: 108, height: 40 };

    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // Shift dagre center coordinates to React Flow's top-left anchor.
    node.position = {
      x: nodeWithPosition.x - width / 2,
      y: nodeWithPosition.y - height / 2,
    };

    return node;
  });

  return { nodes: layoutedNodes, edges };
};
