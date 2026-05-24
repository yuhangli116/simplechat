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

export const exportMindMapAsImage = async (element: HTMLElement, title: string) => {
  await exportImage(element, `${title}_思维导图.png`);
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
