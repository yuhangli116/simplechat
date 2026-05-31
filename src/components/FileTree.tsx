import React, { useEffect, useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileText, 
  Map, 
  Users, 
  GitBranch, 
  List,
  Plus,
  Edit2,
  Trash2,
  Star,
  Heart,
  Flag,
  Bookmark,
  Tag,
  Zap,
  Award,
  Box,
  Circle,
  Hexagon,
  Download,
  Package
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import CreateWorkDialog, { CreateWorkData } from './CreateWorkDialog';
import { useAuthStore } from '@/store/useAuthStore';
import { useFileStore, FileNode, initialFileStructure } from '@/store/useFileStore';
import { useTrashStore } from '@/store/useTrashStore';
import { createTrashSnapshot, deleteWorkspaceNode, findWorkNodeForTarget, loadWorkspaceTree, persistWorkTree } from '@/lib/workspacePersistence';
import { createZip } from '@/lib/fileExport';

export type { FileNode };

const CUSTOM_ICONS = [
  'Star', 'Heart', 'Flag', 'Bookmark', 'Tag', 'Zap', 'Award', 'Box', 'Circle', 'Hexagon'
];

const getRandomIcon = () => {
  return CUSTOM_ICONS[Math.floor(Math.random() * CUSTOM_ICONS.length)];
};

type DragPayload = {
  nodeId: string;
  parentId: string;
  nodeType: 'file' | 'mindmap';
};

const DRAG_MIME = 'application/x-simplechat-filetree';

const readDragPayload = (event: React.DragEvent): DragPayload | null => {
  const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (!parsed?.nodeId || !parsed?.parentId || !parsed?.nodeType) return null;
    return parsed;
  } catch {
    return null;
  }
};

const FileTreeNode = ({ 
  node, 
  level, 
  parentId,
  parentName,
  onSelect, 
  onAddChapter,
  onAddMindMap,
  onRename,
  onDelete,
  onExportWork,
  onReorder,
  editingId,
  setEditingId,
  dragging,
  setDragging,
  dragOver,
  setDragOver,
  onDragEnd
}: { 
  node: FileNode, 
  level: number, 
  parentId: string | null,
  parentName: string | null,
  onSelect: (node: FileNode) => void, 
  onAddChapter: (parentId: string) => void,
  onAddMindMap: (parentId: string) => void,
  onRename: (id: string, newName: string) => void,
  onDelete: (node: FileNode) => void,
  onExportWork: (node: FileNode) => void,
  onReorder: (payload: DragPayload, targetParentId: string, targetId: string | null, insertAfter: boolean) => void,
  editingId: string | null,
  setEditingId: (id: string | null) => void,
  dragging: DragPayload | null,
  setDragging: (value: DragPayload | null) => void,
  dragOver: { targetId: string; position: 'before' | 'after' | 'append' } | null,
  setDragOver: (value: { targetId: string; position: 'before' | 'after' | 'append' } | null) => void,
  onDragEnd: () => void
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [editName, setEditName] = useState(node.name);
  const location = useLocation();
  
  // Determine if selected based on path matching (simple logic)
  // For folders, we don't highlight. Only leaf nodes.
  const isSelected = node.path && location.pathname.includes(node.path);
  const isEditing = editingId === node.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      onSelect(node);
    }
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddChapter(node.id);
  };

  const handleAddMindMapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddMindMap(node.id);
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(node.name);
    setEditingId(node.id);
  };

  const handleSubmitRename = () => {
    if (editName && editName !== node.name) {
      onRename(node.id, editName);
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmitRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditName(node.name);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(node);
  };

  const getIcon = () => {
    if (node.type === 'folder') return <Folder className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />;
    
    // Custom Icons
    if (node.customIcon) {
        switch(node.customIcon) {
            case 'Star': return <Star className="w-4 h-4 text-amber-500" />;
            case 'Heart': return <Heart className="w-4 h-4 text-rose-500" />;
            case 'Flag': return <Flag className="w-4 h-4 text-red-500" />;
            case 'Bookmark': return <Bookmark className="w-4 h-4 text-indigo-500" />;
            case 'Tag': return <Tag className="w-4 h-4 text-emerald-500" />;
            case 'Zap': return <Zap className="w-4 h-4 text-yellow-500" />;
            case 'Award': return <Award className="w-4 h-4 text-orange-500" />;
            case 'Box': return <Box className="w-4 h-4 text-cyan-500" />;
            case 'Circle': return <Circle className="w-4 h-4 text-purple-500" />;
            case 'Hexagon': return <Hexagon className="w-4 h-4 text-pink-500" />;
            default: return <FileText className="w-4 h-4 text-gray-500" />;
        }
    }

    if (node.mindMapType === 'outline') return <GitBranch className="w-4 h-4 text-purple-500" />;
    if (node.mindMapType === 'world') return <Map className="w-4 h-4 text-green-500" />;
    if (node.mindMapType === 'character') return <Users className="w-4 h-4 text-blue-500" />;
    if (node.mindMapType === 'event') return <List className="w-4 h-4 text-orange-500" />;
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  // Check folders
  const isChaptersFolder = node.name === '正文情节';
  const isMetaFolder = node.name === '作品相关';
  const isWorkFolder = level === 0 && node.type === 'folder';
  
  // Determine if node is editable/deletable
  // Level 0 (Work folders), 'file' type (Chapters), and 'mindmap' type are editable/deletable
  const canEdit = level === 0 || node.type === 'file' || node.type === 'mindmap';

  const draggable = Boolean(
    !isEditing &&
    parentId &&
    ((node.type === 'file' && parentName === '正文情节') ||
      (node.type === 'mindmap' && parentName === '作品相关'))
  );

  const isDropContainer = Boolean(
    !isEditing &&
    (isChaptersFolder || isMetaFolder)
  );

  const isDragOverRow = dragOver?.targetId === node.id;

  const handleDragStart = (e: React.DragEvent) => {
    if (!draggable || !parentId) return;
    if (node.type !== 'file' && node.type !== 'mindmap') return;
    e.stopPropagation();
    const payload: DragPayload = {
      nodeId: node.id,
      parentId,
      nodeType: node.type,
    };
    const raw = JSON.stringify(payload);
    e.dataTransfer.setData(DRAG_MIME, raw);
    e.dataTransfer.setData('text/plain', raw);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(payload);
  };

  const handleDragOver = (e: React.DragEvent) => {
    const payload = dragging || readDragPayload(e);
    if (!payload) return;
    if (payload.nodeId === node.id) return;
    if (payload.nodeType !== 'file' && payload.nodeType !== 'mindmap') return;

    if (node.type === 'folder') {
      if (node.id !== payload.parentId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOver({ targetId: node.id, position: 'append' });
      return;
    }

    if (!parentId) return;
    if (payload.parentId !== parentId) return;
    if (payload.nodeType !== node.type) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;
    setDragOver({ targetId: node.id, position: insertAfter ? 'after' : 'before' });
  };

  const handleDrop = (e: React.DragEvent) => {
    const payload = dragging || readDragPayload(e);
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();

    if (node.type === 'folder') {
      if (node.id !== payload.parentId) return;
      onReorder(payload, node.id, null, true);
      onDragEnd();
      return;
    }

    if (!parentId) return;
    if (payload.parentId !== parentId) return;
    if (payload.nodeType !== node.type) return;
    if (payload.nodeId === node.id) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;
    onReorder(payload, parentId, node.id, insertAfter);
    onDragEnd();
  };

  return (
    <div>
      <div 
        className={`group relative flex items-center justify-between py-1.5 px-2 cursor-pointer transition-colors text-sm select-none pr-2
          ${isSelected ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-700'}
          ${isDragOverRow ? (dragOver?.position === 'append' ? 'ring-1 ring-purple-400' : '') : ''}
        `}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={handleToggle}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={draggable || isDropContainer ? handleDragOver : undefined}
        onDrop={draggable || isDropContainer ? handleDrop : undefined}
      >
        {isDragOverRow && dragOver?.position === 'before' && (
          <div className="pointer-events-none absolute left-2 right-2 top-0 h-[2px] bg-purple-500 rounded" />
        )}
        {isDragOverRow && dragOver?.position === 'after' && (
          <div className="pointer-events-none absolute left-2 right-2 bottom-0 h-[2px] bg-purple-500 rounded" />
        )}

        <div className="flex items-center overflow-hidden flex-1">
          <span className="mr-1 text-gray-400 flex-shrink-0">
            {node.type === 'folder' && (
              isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            )}
            {node.type !== 'folder' && <span className="w-3 inline-block" />}
          </span>
          
          <span className="mr-2 flex-shrink-0">{getIcon()}</span>
          
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSubmitRename}
              onKeyDown={handleKeyDown}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 px-1 py-0.5 border border-blue-500 rounded text-sm outline-none"
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
        </div>

        <div className={`flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ${isEditing ? 'hidden' : ''}`}>
          {/* Add Chapter Button for specific folder */}
          {isChaptersFolder && (
            <div className="relative group/btn">
              <button 
                onClick={handleAddClick}
                className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-gray-700"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 text-[10px] font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                新建章节
              </span>
            </div>
          )}

          {/* Add MindMap Button for meta folder */}
          {isMetaFolder && (
            <div className="relative group/btn">
              <button 
                onClick={handleAddMindMapClick}
                className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-gray-700"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 text-[10px] font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                新建大纲
              </span>
            </div>
          )}

          {/* Export Button for work folder */}
          {isWorkFolder && (
            <div className="relative group/btn">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onExportWork(node);
                }}
                className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-purple-600"
              >
                <Package className="w-3.5 h-3.5" />
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 text-[10px] font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                打包
              </span>
            </div>
          )}
          
          {/* Edit/Delete Buttons */}
          {canEdit && (
            <>
              <div className="relative group/btn">
                <button 
                  onClick={handleRenameClick}
                  className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-gray-700"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 text-[10px] font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                  编辑
                </span>
              </div>
              <div className="relative group/btn">
                <button 
                  onClick={handleDeleteClick}
                  className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 text-[10px] font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                  删除
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode 
              key={child.id} 
              node={child} 
              level={level + 1} 
              parentId={node.id}
              parentName={node.name}
              onSelect={onSelect} 
              onAddChapter={onAddChapter}
              onAddMindMap={onAddMindMap}
              onRename={onRename}
              onDelete={onDelete}
              onExportWork={onExportWork}
              onReorder={onReorder}
              editingId={editingId}
              setEditingId={setEditingId}
              dragging={dragging}
              setDragging={setDragging}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dragOver, setDragOver] = useState<{ targetId: string; position: 'before' | 'after' | 'append' } | null>(null);
  
  const { files, setFiles, removeNode } = useFileStore();
  const { addToTrash } = useTrashStore();

  const refreshWorkspace = async () => {
    if (!user) return;
    try {
      const nextFiles = await loadWorkspaceTree(user.id);
      setFiles(nextFiles as FileNode[]);
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
    }
  };

  useEffect(() => {
    refreshWorkspace();
  }, [user?.id]);

  const handleSelect = (node: FileNode) => {
    if (node.path) {
      // Pass the node name in the state so the target component can use it
      navigate(node.path, { state: { fileName: node.name } });
    }
  };

  const handleDragEnd = () => {
    setDragOver(null);
    setDragging(null);
  };

  const reorderWithinParent = (nodes: FileNode[], parentId: string, draggedId: string, targetId: string | null, insertAfter: boolean): FileNode[] => {
    return nodes.map((node) => {
      if (node.id === parentId) {
        const children = [...(node.children || [])];
        const fromIndex = children.findIndex((c) => c.id === draggedId);
        if (fromIndex === -1) return node;

        const [moved] = children.splice(fromIndex, 1);

        let insertIndex = children.length;
        if (targetId) {
          const targetIndex = children.findIndex((c) => c.id === targetId);
          if (targetIndex !== -1) {
            insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
          }
        }

        children.splice(Math.max(0, Math.min(insertIndex, children.length)), 0, moved);
        return { ...node, children };
      }

      if (node.children) {
        return { ...node, children: reorderWithinParent(node.children, parentId, draggedId, targetId, insertAfter) };
      }

      return node;
    });
  };

  const handleReorder = async (payload: DragPayload, targetParentId: string, targetId: string | null, insertAfter: boolean) => {
    if (!payload?.nodeId || !payload?.parentId) return;
    if (payload.parentId !== targetParentId) return;

    const nextFiles = reorderWithinParent(files, targetParentId, payload.nodeId, targetId, insertAfter);
    setFiles(nextFiles);

    if (user) {
      const workNode = findWorkNodeForTarget(nextFiles as any, targetParentId);
      if (workNode) {
        await persistWorkTree(user.id, workNode as any);
        await refreshWorkspace();
      }
    }
  };

  const handleAddChapter = async (parentId: string) => {
    // Dev Mode: Allow adding chapter without login
    // if (!user) {
    //   if (confirm('请先登录以创建章节')) {
    //     // navigate('/login'); // Can't navigate from here easily without hook
    //     window.location.href = '/login';
    //   }
    //   return;
    // }

    // Generate default name: "未命名章节" + count
    // To be precise, we could count existing children, but a timestamp or random suffix is safer/easier
    // User asked for "未命名章节1"... logic. Let's just use "未命名章节" for now to ensure response.
    // Or better, count the siblings.
    
    // Find parent node to count children
    const parentNode = findNode(files, parentId);
    const childCount = parentNode?.children?.length || 0;
    const name = `未命名章节${childCount + 1}`;

    const newChapterId = uuidv4();
    // Assuming structure: /workspace/p/{workId}/story/{chapterId}
    // We need to find the workId. The parentId is typically 'chapters-{workId}'.
    let workId = 'book-1'; // Default fallback
    if (parentNode && parentNode.id.startsWith('chapters-')) {
       workId = parentNode.id.replace('chapters-', '');
    }

    const newChapter: FileNode = {
      id: `ch-${newChapterId}`,
      name: name,
      type: 'file',
      path: `/workspace/p/${workId}/story/${newChapterId}`
    };

    const addNodeRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newChapter]
          };
        }
        if (node.children) {
          return {
            ...node,
            children: addNodeRecursive(node.children)
          };
        }
        return node;
      });
    };

    const nextFiles = addNodeRecursive(files);
    setFiles(nextFiles);

    if (user) {
      const workNode = findWorkNodeForTarget(nextFiles as any, parentId);
      if (workNode) {
        await persistWorkTree(user.id, workNode as any);
        await refreshWorkspace();
      }
    }

    navigate(newChapter.path!, { state: { fileName: newChapter.name } });
  };

  const handleAddMindMap = async (parentId: string) => {
    const parentNode = findNode(files, parentId);
    const childCount = parentNode?.children?.length || 0;
    const name = `新建大纲${childCount + 1}`;
    const newId = uuidv4();
    
    let workId = 'book-1';
    // parentId is like meta-{workId}
    if (parentNode && parentNode.id.startsWith('meta-')) {
        workId = parentNode.id.replace('meta-', '');
    }

    const newMindMap: FileNode = {
        id: `mm-custom-${newId}`,
        name: name,
        type: 'mindmap',
        mindMapType: 'outline',
        customIcon: getRandomIcon(), // Assign random icon
        path: `/workspace/p/${workId}/mindmap/${newId}`
    };

    const addNodeRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newMindMap]
          };
        }
        if (node.children) {
          return {
            ...node,
            children: addNodeRecursive(node.children)
          };
        }
        return node;
      });
    };

    const nextFiles = addNodeRecursive(files);
    setFiles(nextFiles);

    if (user) {
      const workNode = findWorkNodeForTarget(nextFiles as any, parentId);
      if (workNode) {
        await persistWorkTree(user.id, workNode as any);
        await refreshWorkspace();
      }
    }
  };

  // Helper to find a node by ID (for getting workId)
  const findNode = (nodes: FileNode[], id: string): FileNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const handleCreateWork = () => {
    // Dev Mode: Allow creating work without login
    // if (!user) {
    //   if (confirm('创建新作品需要登录，是否立即登录？')) {
    //     navigate('/login');
    //   }
    //   return;
    // }
    setShowCreateDialog(true);
  };

  const handleCreateWorkSubmit = async (data: CreateWorkData) => {
    const newWorkId = uuidv4();
    
    // 1. Create Mind Map Nodes
    const mindMapNodes: FileNode[] = [];
    if (data.selectedPages.includes('outline')) {
      mindMapNodes.push({ id: `mm-outline-${newWorkId}`, name: '作品大纲', type: 'mindmap', mindMapType: 'outline', path: `/workspace/p/${newWorkId}/outline` });
    }
    if (data.selectedPages.includes('world')) {
      mindMapNodes.push({ id: `mm-world-${newWorkId}`, name: '世界设定', type: 'mindmap', mindMapType: 'world', path: `/workspace/p/${newWorkId}/world` });
    }
    if (data.selectedPages.includes('character')) {
      mindMapNodes.push({ id: `mm-char-${newWorkId}`, name: '角色塑造', type: 'mindmap', mindMapType: 'character', path: `/workspace/p/${newWorkId}/characters` });
    }
    if (data.selectedPages.includes('event')) {
      mindMapNodes.push({ id: `mm-event-${newWorkId}`, name: '事件细纲', type: 'mindmap', mindMapType: 'event', path: `/workspace/p/${newWorkId}/events` });
    }

    // 2. Create Chapter Nodes
    const chapterNodes: FileNode[] = [];
    for (let i = 1; i <= data.chapterCount; i++) {
        const chapterId = uuidv4();
        chapterNodes.push({ 
            id: `ch-${chapterId}`, 
            name: `未命名章节${i}`, 
            type: 'file', 
            path: `/workspace/p/${newWorkId}/story/${chapterId}` 
        });
    }

    const newWork: FileNode = {
      id: newWorkId,
      name: data.name,
      type: 'folder',
      children: [
        {
          id: `meta-${newWorkId}`,
          name: '作品相关',
          type: 'folder',
          children: mindMapNodes
        },
        {
          id: `chapters-${newWorkId}`,
          name: '正文情节',
          type: 'folder',
          children: chapterNodes
        }
      ]
    };

    // Add to 'root' (files[0]) children
    let newFiles = [...files];
    if (newFiles.length === 0) {
      newFiles = JSON.parse(JSON.stringify(initialFileStructure));
    }
    
    if (newFiles[0].children) {
      newFiles[0].children.push(newWork);
    } else {
      newFiles[0].children = [newWork];
    }
    setFiles(newFiles);

    if (user) {
      await persistWorkTree(user.id, newWork as any);
      await refreshWorkspace();
    }
  };

  const handleRename = async (id: string, newName: string) => {
    const updateNodeRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, name: newName };
        }
        if (node.children) {
          return { ...node, children: updateNodeRecursive(node.children) };
        }
        return node;
      });
    };

    const nextFiles = updateNodeRecursive(files);
    setFiles(nextFiles);

    if (user) {
      const workNode = findWorkNodeForTarget(nextFiles as any, id);
      if (workNode) {
        await persistWorkTree(user.id, workNode as any);
        await refreshWorkspace();
      }
    }
  };

  const handleDelete = async (targetNode: FileNode) => {
    if (!window.confirm(`确定要将 "${targetNode.name}" 移至回收站吗？`)) return;

    // Find parent and work context before deleting
    let parentId: string | undefined;
    let workName: string | undefined;

    const findContext = (nodes: FileNode[], currentWorkName?: string, currentParentId?: string) => {
      for (const node of nodes) {
        if (node.id === targetNode.id) {
          parentId = currentParentId;
          workName = currentWorkName;
          return true;
        }
        if (node.children) {
          // If this is a top-level work (child of root), update currentWorkName
          const nextWorkName = currentParentId === 'root' ? node.name : currentWorkName;
          if (findContext(node.children, nextWorkName, node.id)) {
            return true;
          }
        }
      }
      return false;
    };

    findContext(files, undefined, 'root');

    // If it's a top-level work, the workName is the node's name itself
    if (parentId === 'root') {
      workName = targetNode.name;
    }

    const trashSnapshot = await createTrashSnapshot(targetNode as any);

    addToTrash({
      originalId: targetNode.id,
      type: targetNode.type === 'file' ? 'chapter' : targetNode.type === 'mindmap' ? 'mindmap' : targetNode.id === parentId ? 'work' : 'folder', // Approximate type mapping
      title: targetNode.name,
      content: trashSnapshot,
      originalPath: targetNode.path,
      parentId,
      workName,
      extra: {
        isFullWork: parentId === 'root'
      }
    });

    const deleteNodeRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter(node => node.id !== targetNode.id).map(node => {
        if (node.children) {
          return { ...node, children: deleteNodeRecursive(node.children) };
        }
        return node;
      });
    };

    const nextFiles = deleteNodeRecursive(files);
    setFiles(nextFiles);

    if (user) {
      await deleteWorkspaceNode(targetNode as any);
      await refreshWorkspace();
    }
  };

  const handleExportWork = async (workNode: FileNode) => {
    const zipFiles: Array<{ name: string; content: string | Blob }> = [];
    const workName = workNode.name;

    const collectFiles = (nodes: FileNode[], basePath: string = '') => {
      nodes.forEach(node => {
        if (node.type === 'file') {
          const workId = node.path?.match(/\/workspace\/p\/([^/]+)/)?.[1];
          const chapterId = node.path?.match(/\/story\/([^/]+)/)?.[1];
          if (workId && chapterId) {
            const key = `story-${workId}-${chapterId}`;
            const content = localStorage.getItem(key) || '';
            if (content) {
              zipFiles.push({
                name: `${basePath}${node.name}.html`,
                content
              });
            }
          }
        } else if (node.type === 'mindmap') {
          let storageKey = '';
          if (node.path?.includes('/mindmap/')) {
            const recordId = node.path.split('/').pop();
            if (recordId) {
              storageKey = `mindmap-${recordId}`;
            }
          } else {
            const workId = node.path?.match(/\/workspace\/p\/([^/]+)/)?.[1];
            const route = node.path?.split('/').pop();
            const editorType = route === 'world' ? 'world' : 
                              route === 'characters' ? 'character' : 
                              route === 'events' ? 'event' : 'outline';
            if (workId) {
              storageKey = `mindmap-${workId}-${editorType}`;
            }
          }
          
          if (storageKey) {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
              zipFiles.push({
                name: `${basePath}${node.name}.json`,
                content: saved
              });
            }
          }
        }
        
        if (node.children) {
          collectFiles(node.children, `${basePath}${node.name}/`);
        }
      });
    };

    if (workNode.children) {
      collectFiles(workNode.children);
    }

    if (zipFiles.length > 0) {
      await createZip(zipFiles, `${workName}_完整作品.zip`);
    } else {
      alert('当前作品没有可导出的内容');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 font-medium text-gray-700 bg-gray-50 shrink-0">
        <div className="flex items-center">
          <Folder className="w-4 h-4 mr-2" />
          我的作品
        </div>
        <button
          onClick={handleCreateWork}
          className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-500 hover:text-gray-900"
          title="新建作品"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-2 bg-gray-50">
        {files?.[0]?.children?.map(node => (
          <FileTreeNode
            key={node.id}
            node={node}
            level={0}
            parentId={'root'}
            parentName={'我的作品'}
            onSelect={handleSelect}
            onAddChapter={handleAddChapter}
            onAddMindMap={handleAddMindMap}
            onRename={handleRename}
            onDelete={handleDelete}
            onExportWork={handleExportWork}
            onReorder={handleReorder}
            editingId={editingId}
            setEditingId={setEditingId}
            dragging={dragging}
            setDragging={setDragging}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Create Work Dialog */}
      <CreateWorkDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={handleCreateWorkSubmit}
      />
    </div>
  );
};

export default FileTree;
