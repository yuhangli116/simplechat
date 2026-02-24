import { create } from 'zustand'

interface AppState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  currentTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  currentTheme: 'light',
  setTheme: (theme) => set({ currentTheme: theme }),
}))
