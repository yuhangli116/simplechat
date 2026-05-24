import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Prompt {
  id: string;
  title?: string;
  index: string;
  tags: string[];
  content: string;
}

const initialPrompts: Prompt[] = [
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

interface PromptState {
  prompts: Prompt[];
  setPrompts: (prompts: Prompt[]) => void;
  addPrompt: (prompt: Prompt) => void;
  updatePrompt: (id: string, updates: Partial<Prompt>) => void;
  removePrompt: (id: string) => void;
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set) => ({
      prompts: initialPrompts,
      
      setPrompts: (prompts) => set({ prompts }),
      
      addPrompt: (prompt) => set((state) => ({ prompts: [...state.prompts, prompt] })),
      
      updatePrompt: (id, updates) => set((state) => ({
        prompts: state.prompts.map(p => p.id === id ? { ...p, ...updates } : p)
      })),
      
      removePrompt: (id) => set((state) => ({
        prompts: state.prompts.filter(p => p.id !== id)
      })),
    }),
    {
      name: 'my-prompts',
    }
  )
);
