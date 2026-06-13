import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isGuestUser, useAuthStore } from './useAuthStore';

export interface Prompt {
  id: string;
  title?: string;
  index: string;
  tags: string[];
  content: string;
}

export const initialPrompts: Prompt[] = [
  {
    id: '1',
    index: '作家',
    title: '角色设定',
    tags: ['职业'],
    content: '你是一个经验丰富的作家，擅长描写细腻的情感和宏大的场面。请帮我构思一个...'
  },
  {
    id: '2',
    index: '短篇小说作家',
    title: '短篇',
    tags: ['快节奏'],
    content: '请以欧·亨利的风格写一篇反转结局的短篇小说，主题是...'
  },
  {
    id: '3',
    index: '创建一个角色',
    title: '角色卡',
    tags: ['详细设定'],
    content: '请详细设计一个反派角色，包含姓名、外貌、性格缺陷、核心动机和不为人知的秘密...'
  },
  {
    id: '4',
    index: '对标',
    title: '风格模仿',
    tags: ['练笔'],
    content: '请模仿鲁迅的笔触，描写一段关于...'
  }
];

// 动态存储：游客模式下持久化到 localStorage（退出时清理），登录用户也使用 localStorage
const dynamicPromptStorage = {
  getItem: (name: string) => {
    try {
      // 游客和登录用户都可以读取 localStorage 中的提示词
      return localStorage.getItem(name);
    } catch {
      return localStorage.getItem(name);
    }
  },
  setItem: (name: string, value: string) => {
    try {
      // 游客和登录用户都可以写入 localStorage
      localStorage.setItem(name, value);
    } catch {
      // ignore
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

interface PromptState {
  prompts: Prompt[];
  setPrompts: (prompts: Prompt[]) => void;
  addPrompt: (prompt: Prompt) => void;
  updatePrompt: (id: string, updates: Partial<Prompt>) => void;
  removePrompt: (id: string) => void;
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set, get) => {
      // 先获取用户状态，判断是否需要初始化预设提示词
      const user = useAuthStore?.getState?.()?.user;
      const initialPromptsValue = isGuestUser(user) ? [] : initialPrompts;
      
      return {
        prompts: initialPromptsValue,
        
        setPrompts: (prompts) => set({ prompts }),
        
        addPrompt: (prompt) => set((state) => ({ prompts: [...state.prompts, prompt] })),
        
        updatePrompt: (id, updates) => set((state) => ({
          prompts: state.prompts.map(p => p.id === id ? { ...p, ...updates } : p)
        })),
        
        removePrompt: (id) => set((state) => ({
          prompts: state.prompts.filter(p => p.id !== id)
        })),
      };
    },
    {
      name: 'my-prompts',
      storage: createJSONStorage(() => dynamicPromptStorage),
      // 只有当 localStorage 中没有数据时才使用初始化值
      merge: (persistedState, currentState) => {
        if (persistedState && (persistedState as any).prompts && (persistedState as any).prompts.length > 0) {
          return { ...currentState, ...(persistedState as any) };
        }
        // 如果没有持久化数据，保持当前的 initial value
        return currentState;
      },
    }
  )
);
