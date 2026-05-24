import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelMemoryScope = 'work' | 'global' | 'chapter';

interface WorkspacePrefsState {
  modelMemoryScope: ModelMemoryScope;
  setModelMemoryScope: (scope: ModelMemoryScope) => void;
}

export const useWorkspacePrefsStore = create<WorkspacePrefsState>()(
  persist(
    (set) => ({
      modelMemoryScope: 'work',
      setModelMemoryScope: (scope) => set({ modelMemoryScope: scope }),
    }),
    {
      name: 'workspace-prefs',
    }
  )
);
