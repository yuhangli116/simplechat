import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Prompt {
  id: string;
  title?: string;
  index: string;
  tags: string[];
  content: string;
  sourceSkillTemplateId?: string | null;
}

export const initialPrompts: Prompt[] = [];

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
      return {
        prompts: initialPrompts,
        
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
