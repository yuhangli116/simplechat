import React, { useState, useEffect } from 'react';
import { FileNode } from './FileTree';
import { Node, Edge } from 'reactflow';
import { ChevronRight, ChevronDown, FileText, Check, X, Folder, Layout, List } from 'lucide-react';
import { getNodeContext } from '@/utils/mindmapUtils';
import { useFileStore } from '@/store/useFileStore';
import { useAuthStore } from '@/store/useAuthStore';
import { loadChapterContent, loadMindMapContent } from '@/lib/workspacePersistence';

interface ContextSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (context: { nodeId: string, content: string, sourceName: string }) => void;
  workId?: string;
}

const ContextSelectorDialog: React.FC<ContextSelectorDialogProps> = ({ isOpen, onClose, onSelect, workId }) => {
  const { files: storeFiles } = useFileStore();
  const { user } = useAuthStore();
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expandedFileNodes, setExpandedFileNodes] = useState<Set<string>>(new Set());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{ nodes: Node[], edges: Edge[] } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Load file tree on mount
  useEffect(() => {
    if (!isOpen) return;
    const findWorkNode = (nodes: FileNode[]): FileNode | null => {
        for (const node of nodes) {
            if (node.id === workId) return node;
            if (node.children) {
                const found = findWorkNode(node.children);
                if (found) return found;
            }
        }
        return null;
    };

    const workNode = workId ? findWorkNode(storeFiles) : null;
    
    if (workNode) {
         setFiles([workNode]);
         setExpandedFileNodes(new Set([workNode.id, `meta-${workNode.id}`]));
    } else {
         setFiles(storeFiles);
         setExpandedFileNodes(new Set(['root']));
    }
  }, [isOpen, workId, storeFiles]);

  const loadStoryContext = async (file: FileNode) => {
      let key = '';
      let activeWorkId = '';
      let activeChapterId = '';
      if (file.path) {
          const parts = file.path.split('/');
          const storyIndex = parts.indexOf('story');
          if (storyIndex !== -1 && storyIndex + 1 < parts.length) {
              activeWorkId = parts[storyIndex - 1];
              activeChapterId = parts[storyIndex + 1];
              key = `story-${activeWorkId}-${activeChapterId}`;
          }
      }

      let content = key ? localStorage.getItem(key) : null;

      if (!content && user && activeChapterId) {
          try {
              content = await loadChapterContent(activeChapterId);
              if (content && key) {
                  localStorage.setItem(key, content);
              }
          } catch (error) {
              console.error('Failed to load story context from Supabase', error);
          }
      }

      if (!content) {
          setFileContent(null);
          return;
      }

      const plainText = content.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
      setFileContent({
          nodes: [{
              id: file.id,
              type: 'mindMap',
              data: { label: file.name, content: plainText },
              position: { x: 0, y: 0 }
          }],
          edges: []
      });
      setSelectedNodeId(file.id);
  };

  const loadMindMapContext = async (file: FileNode) => {
      let key = '';
      let mapType = 'outline';
      let activeWorkId = '';
      let recordId = '';

      if (file.path) {
          const parts = file.path.split('/');
          if (parts.includes('mindmap')) {
              const idIndex = parts.indexOf('mindmap') + 1;
              if (idIndex < parts.length) {
                  recordId = parts[idIndex];
                  activeWorkId = parts[parts.indexOf('p') + 1];
                  key = `mindmap-${recordId}`;
              }
          } else if (parts.includes('p')) {
              const pIndex = parts.indexOf('p');
              activeWorkId = parts[pIndex + 1];
              let t = parts[pIndex + 2];
              if (t === 'characters') t = 'character';
              if (t === 'events') t = 'event';
              key = `mindmap-${activeWorkId}-${t}`;
              mapType = t;
          }
      }

      let content = key ? localStorage.getItem(key) : null;
      if (!content && user && activeWorkId) {
          try {
              const remoteContent = await loadMindMapContent({
                  workId: activeWorkId,
                  id: recordId || undefined,
                  type: recordId ? undefined : mapType as 'outline' | 'world' | 'character' | 'event'
              });
              if (remoteContent) {
                  content = JSON.stringify(remoteContent);
                  if (key) {
                      localStorage.setItem(key, content);
                  }
              }
          } catch (error) {
              console.error('Failed to load mind map context from Supabase', error);
          }
      }

      if (content) {
          try {
              setFileContent(JSON.parse(content));
          } catch (e) {
              console.error("Failed to parse mindmap content", e);
              setFileContent(null);
          }
      } else if (['outline', 'world', 'character', 'event'].includes(mapType)) {
          setFileContent(getDefaultData(mapType));
      } else {
          setFileContent(null);
      }
  };

  const getDefaultData = (type: string) => {
    const rootId = 'root';
    let rootLabel = '作品大纲';
    if (type === 'world') rootLabel = '世界设定';
    if (type === 'character') rootLabel = '角色关系';
    if (type === 'event') rootLabel = '事件细纲';

    return {
      nodes: [
        {
          id: rootId,
          type: 'mindMap',
          data: { label: rootLabel, isRoot: true },
          position: { x: 250, y: 250 },
        },
      ],
      edges: []
    };
  };

  // Load file content when a mind map file is selected
  const handleFileSelect = async (file: FileNode) => {
      if (file.type === 'folder') {
          // Toggle folder
          const newExpanded = new Set(expandedFileNodes);
          if (newExpanded.has(file.id)) {
              newExpanded.delete(file.id);
          } else {
              newExpanded.add(file.id);
          }
          setExpandedFileNodes(newExpanded);
          return;
      }
      
      setSelectedFileId(file.id);
      setSelectedNodeId(null); 
      
      if (file.type === 'file') {
          await loadStoryContext(file);
          return;
      }

      await loadMindMapContext(file);
  };
  
  // Recursive render of File Tree
  const renderFileTree = (nodes: FileNode[], level = 0) => {
      return nodes.map(node => {
          // if (node.type === 'file') return null; // Now supporting file type
          
          const isExpanded = expandedFileNodes.has(node.id);
          const isSelected = selectedFileId === node.id;
          
          return (
              <div key={node.id}>
                  <div 
                      className={`
                          flex items-center py-1.5 px-2 cursor-pointer hover:bg-gray-100 rounded text-sm transition-colors
                          ${isSelected ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}
                      `}
                      style={{ paddingLeft: `${level * 16 + 8}px` }}
                      onClick={() => handleFileSelect(node)}
                  >
                      <span className="mr-1.5 text-gray-400">
                          {node.type === 'folder' ? (
                              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          ) : (
                              node.type === 'file' ? <FileText className="w-4 h-4" /> : <Layout className="w-4 h-4" />
                          )}
                      </span>
                      {node.name}
                  </div>
                  {node.children && isExpanded && (
                      <div>{renderFileTree(node.children, level + 1)}</div>
                  )}
              </div>
          );
      });
  };

  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  // Toggle expansion of a node in the right panel
  const toggleNodeExpansion = (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedNodeIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(nodeId)) {
              newSet.delete(nodeId);
          } else {
              newSet.add(nodeId);
          }
          return newSet;
      });
  };

  // Auto-expand root nodes when content loads
  useEffect(() => {
      if (fileContent?.nodes) {
          const rootNodes = fileContent.nodes.filter(n => n.data?.isRoot || !fileContent.edges.some(e => e.target === n.id));
          const initialExpanded = new Set<string>();
          rootNodes.forEach(n => initialExpanded.add(n.id));
          setExpandedNodeIds(initialExpanded);
      }
  }, [fileContent]);

  // Recursive render of Mind Map Nodes
  const renderNodeTree = (nodes: Node[], parentId: string | null = null, level = 0) => {
      let currentLevelNodes: Node[] = [];
      
      if (parentId === null) {
          // Find root(s)
          currentLevelNodes = nodes.filter(n => n.data?.isRoot || !fileContent?.edges.some(e => e.target === n.id));
          if (currentLevelNodes.length === 0 && nodes.length > 0) {
              // Fallback to first node if no root found
              currentLevelNodes = [nodes[0]]; 
          }
      } else {
          const childrenIds = fileContent?.edges
              .filter(e => e.source === parentId)
              .map(e => e.target) || [];
          
          currentLevelNodes = nodes.filter(n => childrenIds.includes(n.id));
          currentLevelNodes.sort((a, b) => a.position.y - b.position.y);
      }
      
      if (currentLevelNodes.length === 0) return null;

      return (
          <div className={`${level > 0 ? 'ml-4 border-l border-gray-200 pl-2' : ''}`}>
              {currentLevelNodes.map(node => {
                  const hasChildren = fileContent?.edges.some(e => e.source === node.id);
                  const isExpanded = expandedNodeIds.has(node.id);
                  
                  return (
                    <div key={node.id}>
                        <div 
                            className={`
                                flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 rounded text-sm mb-0.5
                                ${selectedNodeId === node.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600'}
                            `}
                            onClick={() => setSelectedNodeId(node.id)}
                        >
                            <span 
                                className={`mr-1.5 flex-shrink-0 cursor-pointer p-0.5 rounded hover:bg-gray-200 ${hasChildren ? 'visible' : 'invisible'}`}
                                onClick={(e) => hasChildren && toggleNodeExpansion(node.id, e)}
                            >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            </span>
                            <span className="truncate">{node.data.label}</span>
                        </div>
                        {hasChildren && isExpanded && renderNodeTree(nodes, node.id, level + 1)}
                    </div>
                  );
              })}
          </div>
      );
  };
  
  const handleConfirm = (shouldClose: boolean = true) => {
      if (!selectedNodeId || !fileContent) return;
      
      const context = getNodeContext(fileContent.nodes, fileContent.edges, selectedNodeId);
      const node = fileContent.nodes.find(n => n.id === selectedNodeId);
      
      // Find file name for display
      const findFile = (nodes: FileNode[]): FileNode | null => {
          for (const n of nodes) {
              if (n.id === selectedFileId) return n;
              if (n.children) {
                  const f = findFile(n.children);
                  if (f) return f;
              }
          }
          return null;
      };
      const file = findFile(files);
      
      // Get full path (breadcrumb)
      const getNodePath = (nodes: Node[], edges: Edge[], nodeId: string): string[] => {
          const path: string[] = [];
          let currentId: string | null = nodeId;
          
          // Use a set to prevent infinite loops if cycles exist (though mind map shouldn't have cycles)
          const visited = new Set<string>();
          
          while (currentId && !visited.has(currentId)) {
              visited.add(currentId);
              const node = nodes.find(n => n.id === currentId);
              if (node) {
                  path.unshift(node.data.label);
              } else {
                  break;
              }
              
              const parentEdge = edges.find(e => e.target === currentId);
              currentId = parentEdge ? parentEdge.source : null;
          }
          return path;
      };

      const path = getNodePath(fileContent.nodes, fileContent.edges, selectedNodeId);
      
      // Deduplicate root name if it matches file name
      // Example: File="作品大纲", Path=["作品大纲", "第一章"] -> Result "作品大纲 > 第一章"
      const displayPath = [...path];
      if (file?.name && displayPath.length > 0 && displayPath[0] === file.name) {
          displayPath.shift(); // Remove duplicate root
      }
      
      const fullPath = [file?.name || '未知文件', ...displayPath].join(' > ');
      
      onSelect({
          nodeId: selectedNodeId,
          content: context,
          sourceName: fullPath
      });
      
      if (shouldClose) {
        onClose();
      } else {
        // Simple feedback
        // In a real app, use a toast
        const btn = document.getElementById('add-continue-btn');
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = '已添加 ✓';
            setTimeout(() => {
                btn.innerText = originalText;
            }, 1000);
        }
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl h-[80vh] shadow-2xl flex overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Sidebar: File Tree */}
        <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50">
          <div className="p-4 border-b border-gray-200 font-medium text-gray-700 flex items-center">
            <Folder className="w-4 h-4 mr-2" />
            选择文件
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {renderFileTree(files)}
          </div>
        </div>

        {/* Main Content: Node Tree */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
             <div className="font-medium text-gray-700 flex items-center">
                <List className="w-4 h-4 mr-2" />
                选择节点 (包含所有子节点)
             </div>
             <button 
               onClick={onClose}
               className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
             >
               <X className="w-5 h-5" />
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
             {selectedFileId ? (
                 fileContent ? (
                     renderNodeTree(fileContent.nodes)
                 ) : (
                     <div className="flex items-center justify-center h-full text-gray-400">
                         加载中或文件为空...
                     </div>
                 )
             ) : (
                 <div className="flex items-center justify-center h-full text-gray-400">
                     请从左侧选择一个思维导图文件
                 </div>
             )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
             <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
             >
                取消
             </button>
             <button
                id="add-continue-btn"
                onClick={() => handleConfirm(false)}
                disabled={!selectedNodeId}
                className={`
                    px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors
                    ${!selectedNodeId ? 'opacity-50 cursor-not-allowed' : ''}
                `}
             >
                添加并继续
             </button>
             <button
                onClick={() => handleConfirm(true)}
                disabled={!selectedNodeId}
                className={`
                    px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-all flex items-center
                    ${selectedNodeId 
                        ? 'bg-blue-600 hover:bg-blue-700 hover:shadow' 
                        : 'bg-gray-300 cursor-not-allowed'}
                `}
             >
                <Check className="w-4 h-4 mr-1.5" />
                确认完成
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextSelectorDialog;
