import type { Node, Edge } from 'reactflow';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';

export const exportToFile = (content: string | Blob, filename: string, type: string = 'text/plain') => {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportHtml = (htmlContent: string, filename: string) => {
  exportToFile(htmlContent, filename, 'text/html');
};

export const exportJson = (data: any, filename: string) => {
  const content = JSON.stringify(data, null, 2);
  exportToFile(content, filename, 'application/json');
};

export const exportMarkdown = (content: string, filename: string) => {
  exportToFile(content, filename, 'text/markdown');
};

export const exportImage = async (element: HTMLElement, filename: string, scale: number = 2) => {
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: null,
  });
  canvas.toBlob((blob) => {
    if (blob) {
      exportToFile(blob, filename, 'image/png');
    }
  });
};

export const exportMindMap = (nodes: Node[], edges: Edge[], title: string) => {
  const data = {
    title,
    exportTime: new Date().toISOString(),
    nodes,
    edges
  };
  exportJson(data, `${title}_思维导图.json`);
};

type MindMapExportTheme = 'dark' | 'light' | 'beige' | 'green';

type MindMapCanvasTheme = {
  background: string;
  edge: string;
  rootFill: string;
  rootFillEnd: string;
  rootText: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  contentText: string;
};

const MIND_MAP_CANVAS_THEMES: Record<MindMapExportTheme, MindMapCanvasTheme> = {
  dark: {
    background: '#111827',
    edge: '#94a3b8',
    rootFill: '#2563eb',
    rootFillEnd: '#4f46e5',
    rootText: '#ffffff',
    nodeFill: '#ffffff',
    nodeStroke: '#e2e8f0',
    nodeText: '#111827',
    contentText: '#475569',
  },
  light: {
    background: '#ffffff',
    edge: '#94a3b8',
    rootFill: '#3b82f6',
    rootFillEnd: '#06b6d4',
    rootText: '#ffffff',
    nodeFill: '#ffffff',
    nodeStroke: '#e2e8f0',
    nodeText: '#111827',
    contentText: '#475569',
  },
  beige: {
    background: '#fefae0',
    edge: '#d4a373',
    rootFill: '#fb923c',
    rootFillEnd: '#f59e0b',
    rootText: '#ffffff',
    nodeFill: '#fffbeb',
    nodeStroke: '#fed7aa',
    nodeText: '#78350f',
    contentText: '#92400e',
  },
  green: {
    background: '#ecfccb',
    edge: '#84cc16',
    rootFill: '#22c55e',
    rootFillEnd: '#059669',
    rootText: '#ffffff',
    nodeFill: '#f0fdf4',
    nodeStroke: '#bbf7d0',
    nodeText: '#14532d',
    contentText: '#166534',
  },
};

const EXPORT_PADDING = 96;
const NODE_BASE_WIDTH = 128;
const NODE_MAX_WIDTH = 240;
const NODE_MIN_HEIGHT = 40;
const CONTENT_WRAP_CHARS = 18;

const wrapTextByChars = (text: string, charsPerLine: number) => {
  if (!text) return [];

  return text
    .split('\n')
    .flatMap((line) => {
      if (!line) return [''];
      if (line.length <= charsPerLine) return [line];
      return line.match(new RegExp(`.{1,${charsPerLine}}`, 'g')) || [line];
    });
};

const getNodeMetrics = (node: Node) => {
  const label = String(node.data?.label || '未命名');
  const content = typeof node.data?.content === 'string' ? node.data.content.trim() : '';
  const contentLines = wrapTextByChars(content, CONTENT_WRAP_CHARS);
  const longestLineLength = Math.max(label.length, ...contentLines.map((line) => line.length), 0);
  const shouldExpandWidth = content.length > CONTENT_WRAP_CHARS || longestLineLength > 12;
  const width = node.data?.isRoot ? 160 : shouldExpandWidth ? NODE_MAX_WIDTH : NODE_BASE_WIDTH;
  const height = Math.max(NODE_MIN_HEIGHT, 28 + contentLines.length * 14 + (contentLines.length > 0 ? 4 : 0));

  return { label, contentLines, width, height };
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const drawWrappedCenteredText = (
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) => {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight, maxWidth);
  });
};

const drawSmoothEdge = (
  ctx: CanvasRenderingContext2D,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  color: string,
) => {
  const deltaX = Math.max(48, Math.abs(targetX - sourceX) * 0.45);
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.bezierCurveTo(sourceX + deltaX, sourceY, targetX - deltaX, targetY, targetX, targetY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
};

export const exportMindMapAsImage = async (
  nodes: Node[],
  edges: Edge[],
  title: string,
  theme: MindMapExportTheme = 'dark',
) => {
  if (nodes.length === 0) return;

  const nodeMetrics = new Map<string, ReturnType<typeof getNodeMetrics>>();
  const nodesWithMetrics = nodes.map((node) => {
    const metrics = getNodeMetrics(node);
    nodeMetrics.set(node.id, metrics);
    return { node, metrics };
  });

  const minX = Math.min(...nodesWithMetrics.map(({ node }) => node.position.x));
  const minY = Math.min(...nodesWithMetrics.map(({ node }) => node.position.y));
  const maxX = Math.max(...nodesWithMetrics.map(({ node, metrics }) => node.position.x + metrics.width));
  const maxY = Math.max(...nodesWithMetrics.map(({ node, metrics }) => node.position.y + metrics.height));
  const width = Math.ceil(maxX - minX + EXPORT_PADDING * 2);
  const height = Math.ceil(maxY - minY + EXPORT_PADDING * 2);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.ceil(width * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(height * pixelRatio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = MIND_MAP_CANVAS_THEMES[theme] || MIND_MAP_CANVAS_THEMES.dark;
  const toCanvasX = (x: number) => (x - minX + EXPORT_PADDING);
  const toCanvasY = (y: number) => (y - minY + EXPORT_PADDING);

  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  edges.forEach((edge) => {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    const sourceMetrics = source ? nodeMetrics.get(source.id) : null;
    const targetMetrics = target ? nodeMetrics.get(target.id) : null;

    if (!source || !target || !sourceMetrics || !targetMetrics) return;

    drawSmoothEdge(
      ctx,
      toCanvasX(source.position.x + sourceMetrics.width),
      toCanvasY(source.position.y + sourceMetrics.height / 2),
      toCanvasX(target.position.x),
      toCanvasY(target.position.y + targetMetrics.height / 2),
      palette.edge,
    );
  });

  nodesWithMetrics.forEach(({ node, metrics }) => {
    const x = toCanvasX(node.position.x);
    const y = toCanvasY(node.position.y);
    const isRoot = Boolean(node.data?.isRoot);

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, x, y, metrics.width, metrics.height, isRoot ? 18 : 14);

    if (isRoot) {
      const gradient = ctx.createLinearGradient(x, y, x + metrics.width, y);
      gradient.addColorStop(0, palette.rootFill);
      gradient.addColorStop(1, palette.rootFillEnd);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = palette.nodeFill;
    }
    ctx.fill();
    ctx.restore();

    roundRect(ctx, x, y, metrics.width, metrics.height, isRoot ? 18 : 14);
    ctx.strokeStyle = isRoot ? 'transparent' : palette.nodeStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    const hasContent = metrics.contentLines.length > 0;
    const titleY = hasContent ? y + 19 : y + metrics.height / 2 + 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isRoot ? palette.rootText : palette.nodeText;
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(metrics.label, x + metrics.width / 2, titleY, metrics.width - 16);

    if (hasContent) {
      ctx.fillStyle = isRoot ? 'rgba(255, 255, 255, 0.82)' : palette.contentText;
      ctx.font = '400 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      drawWrappedCenteredText(ctx, metrics.contentLines, x + metrics.width / 2, y + 37, metrics.width - 16, 14);
    }
  });

  canvas.toBlob((blob) => {
    if (blob) {
      exportToFile(blob, `${title}_思维导图.png`, 'image/png');
    }
  }, 'image/png');
};

export const exportMindMapAsText = (nodes: Node[], edges: Edge[], title: string) => {
  let textContent = `# ${title}\n\n`;
  
  const findChildren = (nodeId: string) => {
    return edges
      .filter(e => e.source === nodeId)
      .map(e => nodes.find(n => n.id === e.target))
      .filter(Boolean) as Node[];
  };
  
  const buildTree = (nodeId: string, level: number = 0) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const indent = '  '.repeat(level);
    const label = node.data.label || '未命名';
    textContent += `${indent}- ${label}\n`;
    
    if (node.data.content) {
      const contentIndent = '  '.repeat(level + 1);
      textContent += `${contentIndent}${node.data.content}\n`;
    }
    
    const children = findChildren(nodeId);
    children.forEach(child => buildTree(child.id, level + 1));
  };
  
  const rootNode = nodes.find(n => n.data.isRoot);
  if (rootNode) {
    buildTree(rootNode.id);
  } else if (nodes.length > 0) {
    buildTree(nodes[0].id);
  }
  
  exportMarkdown(textContent, `${title}_思维导图.md`);
};

export const htmlToMarkdown = (html: string): string => {
  let markdown = html;
  
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  
  markdown = markdown.replace(/<[^>]+>/g, '');
  
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  
  return markdown.trim();
};

export const createZip = async (files: Array<{ name: string; content: string | Blob }>, zipName: string) => {
  const zip = new JSZip();
  
  files.forEach(file => {
    zip.file(file.name, file.content);
  });
  
  const blob = await zip.generateAsync({ type: 'blob' });
  exportToFile(blob, zipName, 'application/zip');
};
