import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { isGuestUser } from './useAuthStore';

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

// 游客限制常量
export const GUEST_LIMITS = {
  MAX_WORKS: 10,
  MAX_CHAPTERS_PER_WORK: 10,
  MAX_MINDMAPS_PER_WORK: 10,
} as const;

export const guestDemoFileStructure: FileNode[] = [
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
              { id: 'mm-character', name: '角色塑造', type: 'mindmap', mindMapType: 'character', path: '/workspace/p/book-1/characters' },
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

export const initialFileStructure: FileNode[] = [
  {
    id: 'root',
    name: '我的作品',
    type: 'folder',
    children: [],
  }
];

// 动态存储：游客模式下不持久化（数据仅内存），登录用户使用 localStorage
const dynamicStorage = {
  getItem: (name: string) => {
    try {
      const user = useAuthStore?.getState?.()?.user;
      if (isGuestUser(user)) return null;
      return localStorage.getItem(name);
    } catch {
      return localStorage.getItem(name);
    }
  },
  setItem: (name: string, value: string) => {
    try {
      const user = useAuthStore?.getState?.()?.user;
      if (isGuestUser(user)) return; // 游客不写入任何存储
      localStorage.setItem(name, value);
    } catch {
      // ignore
    }
  },
  removeItem: (name: string) => {
    try {
      const user = useAuthStore?.getState?.()?.user;
      if (isGuestUser(user)) return;
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

interface FileState {
  files: FileNode[];
  createWorkInProgress: boolean;
  setFiles: (files: FileNode[]) => void;
  setCreateWorkInProgress: (value: boolean) => void;
  addNode: (node: FileNode, parentId?: string) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, updates: Partial<FileNode>) => void;
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      files: initialFileStructure,
      createWorkInProgress: false,

      setFiles: (files) => set({ files }),
      setCreateWorkInProgress: (value) => set({ createWorkInProgress: value }),

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
      name: 'my-works-tree',
      // 游客模式：动态存储不写入（数据仅内存），刷新即清理
      // 登录用户：数据持久化到 localStorage
      storage: dynamicStorage as any,
    }
  )
);
