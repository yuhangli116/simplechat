import React, { useState } from 'react';
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
  Trash2
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'file' | 'mindmap';
  mindMapType?: 'outline' | 'world' | 'character' | 'event';
  children?: FileNode[];
  path?: string; // Route path
}

const initialFileStructure: FileNode[] = [
  {
    id: 'root',
    name: '我的作品',
    type: 'folder',
    children: [
      {
        id: 'book-1',
        name: '武夫当家',
        type: 'folder',
        children: [
          {
            id: 'meta-book-1',
            name: '作品相关',
            type: 'folder',
            children: [
              { id: 'mm-outline', name: '作品大纲', type: 'mindmap', mindMapType: 'outline', path: '/workspace/p/book-1/outline' },
              { id: 'mm-world', name: '世界设定', type: 'mindmap', mindMapType: 'world', path: '/workspace/p/book-1/world' },
              { id: 'mm-char', name: '角色塑造', type: 'mindmap', mindMapType: 'character', path: '/workspace/p/book-1/characters' },
              { id: 'mm-event', name: '事件细纲', type: 'mindmap', mindMapType: 'event', path: '/workspace/p/book-1/events' },
            ]
          },
          {
            id: 'chapters-book-1',
            name: '正文情节',
            type: 'folder',
            children: [
              { id: 'ch-1', name: '未命名章节1', type: 'file', path: '/workspace/p/book-1/story/1' },
              { id: 'ch-2', name: '未命名章节2', type: 'file', path: '/workspace/p/book-1/story/2' },
              { id: 'ch-3', name: '未命名章节3', type: 'file', path: '/workspace/p/book-1/story/3' },
            ]
          }
        ]
      }
    ]
  }
];

const FileTreeNode = ({ 
  node, 
  level, 
  onSelect, 
  onAddChapter,
  onAddMindMap,
  onRename,
  onDelete,
  editingId,
  setEditingId
}: { 
  node: FileNode, 
  level: number, 
  onSelect: (node: FileNode) => void, 
  onAddChapter: (parentId: string) => void,
  onAddMindMap: (parentId: string) => void,
  onRename: (id: string, newName: string) => void,
  onDelete: (node: FileNode) => void,
  editingId: string | null,
  setEditingId: (id: string | null) => void
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
    if (node.mindMapType === 'outline') return <GitBranch className="w-4 h-4 text-purple-500" />;
    if (node.mindMapType === 'world') return <Map className="w-4 h-4 text-green-500" />;
    if (node.mindMapType === 'character') return <Users className="w-4 h-4 text-blue-500" />;
    if (node.mindMapType === 'event') return <List className="w-4 h-4 text-orange-500" />;
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  // Check folders
  const isChaptersFolder = node.name === '正文情节';
  const isMetaFolder = node.name === '作品相关';
  
  // Determine if node is editable/deletable
  // Level 0 (Work folders), 'file' type (Chapters), and 'mindmap' type are editable/deletable
  const canEdit = level === 0 || node.type === 'file' || node.type === 'mindmap';

  return (
    <div>
      <div 
        className={`group flex items-center justify-between py-1.5 px-2 cursor-pointer transition-colors text-sm select-none pr-2
          ${isSelected ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-700'}
        `}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={handleToggle}
      >
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
            <button 
              onClick={handleAddClick}
              className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-gray-700"
              title="新建章节"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Add MindMap Button for meta folder */}
          {isMetaFolder && (
            <button 
              onClick={handleAddMindMapClick}
              className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-gray-700"
              title="新建大纲"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Edit/Delete Buttons */}
          {canEdit && (
            <>
              <button 
                onClick={handleRenameClick}
                className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-gray-700"
                title="重命名"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={handleDeleteClick}
                className="p-1 rounded hover:bg-gray-300 text-gray-500 hover:text-red-600"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
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
              onSelect={onSelect} 
              onAddChapter={onAddChapter}
              onAddMindMap={onAddMindMap}
              onRename={onRename}
              onDelete={onDelete}
              editingId={editingId}
              setEditingId={setEditingId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree = () => {
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Load initial state from localStorage or use default
  const [files, setFiles] = useState<FileNode[]>(() => {
    const saved = localStorage.getItem('my-works-tree');
    return saved ? JSON.parse(saved) : initialFileStructure;
  });

  // Save to localStorage whenever files change
  React.useEffect(() => {
    localStorage.setItem('my-works-tree', JSON.stringify(files));
  }, [files]);

  const handleSelect = (node: FileNode) => {
    if (node.path) {
      navigate(node.path);
    }
  };

  const handleAddChapter = (parentId: string) => {
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

    setFiles(addNodeRecursive(files));
    // Optional: navigate to new chapter immediately
    // navigate(newChapter.path!); 
  };

  const handleAddMindMap = (parentId: string) => {
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

    setFiles(addNodeRecursive(files));
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
    const name = '未命名作品';
    
    const newWorkId = uuidv4();
    const newWork: FileNode = {
      id: newWorkId,
      name: name,
      type: 'folder',
      children: [
        {
          id: `meta-${newWorkId}`,
          name: '作品相关',
          type: 'folder',
          children: [
            { id: `mm-outline-${newWorkId}`, name: '作品大纲', type: 'mindmap', mindMapType: 'outline', path: `/workspace/p/${newWorkId}/outline` },
            { id: `mm-world-${newWorkId}`, name: '世界设定', type: 'mindmap', mindMapType: 'world', path: `/workspace/p/${newWorkId}/world` },
            { id: `mm-char-${newWorkId}`, name: '角色塑造', type: 'mindmap', mindMapType: 'character', path: `/workspace/p/${newWorkId}/characters` },
            { id: `mm-event-${newWorkId}`, name: '事件细纲', type: 'mindmap', mindMapType: 'event', path: `/workspace/p/${newWorkId}/events` },
          ]
        },
        {
          id: `chapters-${newWorkId}`,
          name: '正文情节',
          type: 'folder',
          children: [
            { id: `ch-1-${newWorkId}`, name: '未命名章节1', type: 'file', path: `/workspace/p/${newWorkId}/story/new` },
          ]
        }
      ]
    };

    // Add to 'root' (files[0]) children
    const newFiles = [...files];
    if (newFiles[0].children) {
      newFiles[0].children.push(newWork);
    } else {
      newFiles[0].children = [newWork];
    }
    setFiles(newFiles);
  };

  const handleRename = (id: string, newName: string) => {
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

    setFiles(updateNodeRecursive(files));
  };

  const handleDelete = (targetNode: FileNode) => {
    if (!window.confirm(`确定要删除 "${targetNode.name}" 吗？此操作无法撤销。`)) return;

    const deleteNodeRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter(node => node.id !== targetNode.id).map(node => {
        if (node.children) {
          return { ...node, children: deleteNodeRecursive(node.children) };
        }
        return node;
      });
    };

    setFiles(deleteNodeRecursive(files));
  };

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 font-medium text-gray-700">
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
      <div className="flex-1 overflow-y-auto py-2">
        {files[0].children?.map(node => (
          <FileTreeNode 
            key={node.id} 
            node={node} 
            level={0} 
            onSelect={handleSelect} 
            onAddChapter={handleAddChapter}
            onAddMindMap={handleAddMindMap}
            onRename={handleRename}
            onDelete={handleDelete}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        ))}
      </div>
    </div>
  );
};

export default FileTree;
