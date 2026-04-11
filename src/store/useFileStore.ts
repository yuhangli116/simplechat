import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'file' | 'mindmap';
  path?: string;
  children?: FileNode[];
  mindMapType?: 'outline' | 'world' | 'character' | 'event';
  customIcon?: string;
  savedContent?: string | null;
  savedMindMap?: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  } | null;
}

// Initial Structure (Copied from FileTree.tsx)
export const initialFileStructure: FileNode[] = [
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

interface FileState {
  files: FileNode[];
  setFiles: (files: FileNode[]) => void;
  addNode: (node: FileNode, parentId?: string) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, updates: Partial<FileNode>) => void;
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      files: initialFileStructure,
      
      setFiles: (files) => set({ files }),
      
      addNode: (newNode, parentId) => {
        const { files } = get();
        
        // If no parentId provided, add to root's children (default behavior for restoring works)
        if (!parentId) {
           let newFiles = [...files];
           if (newFiles.length === 0) {
             newFiles = JSON.parse(JSON.stringify(initialFileStructure));
           }
           if (newFiles[0].children) {
             newFiles[0].children.push(newNode);
           } else {
             newFiles[0].children = [newNode];
           }
           set({ files: newFiles });
           return;
        }

        let nodeAdded = false;
        const addNodeRecursive = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(node => {
            if (node.id === parentId) {
              nodeAdded = true;
              return {
                ...node,
                children: [...(node.children || []), newNode]
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
        
        // Try to add to specific parent
        let newFiles = addNodeRecursive(files);
        
        // If parent not found (maybe parent was deleted?), fallback to root
        if (!nodeAdded) {
          if (newFiles.length === 0) {
            newFiles = JSON.parse(JSON.stringify(initialFileStructure));
          }
          if (newFiles[0].children) {
            newFiles[0].children.push(newNode);
          } else {
            newFiles[0].children = [newNode];
          }
        }
        
        set({ files: newFiles });
      },

      removeNode: (id) => {
        const { files } = get();
        const deleteNodeRecursive = (nodes: FileNode[]): FileNode[] => {
          return nodes.filter(node => node.id !== id).map(node => {
            if (node.children) {
              return { ...node, children: deleteNodeRecursive(node.children) };
            }
            return node;
          });
        };
        set({ files: deleteNodeRecursive(files) });
      },

      updateNode: (id, updates) => {
        const { files } = get();
        const updateNodeRecursive = (nodes: FileNode[]): FileNode[] => {
            return nodes.map(node => {
              if (node.id === id) {
                return { ...node, ...updates };
              }
              if (node.children) {
                return { ...node, children: updateNodeRecursive(node.children) };
              }
              return node;
            });
          };
          set({ files: updateNodeRecursive(files) });
      }
    }),
    {
      name: 'my-works-tree', // Use same key as FileTree.tsx to pick up existing data!
    }
  )
);
