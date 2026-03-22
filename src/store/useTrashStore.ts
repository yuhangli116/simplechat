import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';

export interface TrashItem {
  id: string; // Unique ID for the trash item
  originalId: string; // Original ID of the item (e.g., node.id or prompt.id)
  type: 'work' | 'chapter' | 'mindmap' | 'prompt' | 'file' | 'folder'; // Type of item
  title: string; // Display name
  content: any; // The full data of the item (for restoration)
  deletedAt: number; // Timestamp
  expiresAt: number; // Auto-delete timestamp (e.g., 30 days later)
  originalPath?: string; // For navigation restoration if needed
  parentId?: string; // ID of the parent node (for tree restoration)
  workName?: string; // Name of the work this item belonged to
  extra?: any; // Any other metadata
}

interface TrashState {
  items: TrashItem[];
  addToTrash: (item: Omit<TrashItem, 'id' | 'deletedAt' | 'expiresAt'>) => void;
  restoreItem: (id: string) => Promise<TrashItem | undefined>; // Returns item for caller to handle re-insertion
  permanentlyDelete: (id: string) => Promise<void>;
  clearTrash: () => Promise<void>; // Clears all items
  clearExpired: () => Promise<void>; // Clears expired items
  syncFromSupabase: () => Promise<void>;
}

const EXPIRATION_DAYS = 30;

export const useTrashStore = create<TrashState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addToTrash: async (item) => {
        const now = Date.now();
        const expiresAt = now + (EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
        const id = uuidv4();
        const newItem: TrashItem = {
          ...item,
          id,
          deletedAt: now,
          expiresAt
        };
        
        // Update local state first for immediate UI feedback
        set((state) => ({
          items: [newItem, ...state.items]
        }));

        // Try to sync with Supabase
        try {
          const user = useAuthStore.getState().user;
          if (user) {
            await supabase.from('trash_items').insert({
              id: newItem.id,
              user_id: user.id,
              original_id: newItem.originalId,
              type: newItem.type,
              title: newItem.title,
              content: newItem.content,
              deleted_at: newItem.deletedAt,
              expires_at: newItem.expiresAt,
              original_path: newItem.originalPath,
              parent_id: newItem.parentId,
              work_name: newItem.workName,
              extra: newItem.extra
            });
          }
        } catch (error) {
          console.error('Failed to sync trash item to Supabase:', error);
        }
      },

      restoreItem: async (id) => {
        const state = get();
        const item = state.items.find(i => i.id === id);
        if (item) {
          set((state) => ({
            items: state.items.filter(i => i.id !== id)
          }));
          
          try {
            const user = useAuthStore.getState().user;
            if (user) {
              await supabase.from('trash_items').delete().eq('id', id).eq('user_id', user.id);
            }
          } catch (error) {
            console.error('Failed to delete trash item from Supabase:', error);
          }
        }
        return item;
      },

      permanentlyDelete: async (id) => {
        set((state) => ({
          items: state.items.filter(i => i.id !== id)
        }));
        
        try {
          const user = useAuthStore.getState().user;
          if (user) {
            await supabase.from('trash_items').delete().eq('id', id).eq('user_id', user.id);
          }
        } catch (error) {
          console.error('Failed to delete trash item from Supabase:', error);
        }
      },

      clearTrash: async () => {
        set({ items: [] });
        
        try {
          const user = useAuthStore.getState().user;
          if (user) {
            await supabase.from('trash_items').delete().eq('user_id', user.id);
          }
        } catch (error) {
          console.error('Failed to clear trash from Supabase:', error);
        }
      },

      clearExpired: async () => {
        const now = Date.now();
        const state = get();
        const expiredIds = state.items.filter(i => i.expiresAt <= now).map(i => i.id);
        
        if (expiredIds.length > 0) {
          set((state) => ({
            items: state.items.filter(i => i.expiresAt > now)
          }));
          
          try {
            const user = useAuthStore.getState().user;
            if (user) {
              await supabase.from('trash_items').delete().in('id', expiredIds).eq('user_id', user.id);
            }
          } catch (error) {
            console.error('Failed to clear expired trash from Supabase:', error);
          }
        }
      },
      
      // Sync from Supabase on load
      syncFromSupabase: async () => {
        try {
          const user = useAuthStore.getState().user;
          if (user) {
            const { data, error } = await supabase
              .from('trash_items')
              .select('*')
              .eq('user_id', user.id)
              .order('deleted_at', { ascending: false });
              
            if (!error && data) {
              const items: TrashItem[] = data.map(d => ({
                id: d.id,
                originalId: d.original_id,
                type: d.type,
                title: d.title,
                content: d.content,
                deletedAt: d.deleted_at,
                expiresAt: d.expires_at,
                originalPath: d.original_path,
                parentId: d.parent_id,
                workName: d.work_name,
                extra: d.extra
              }));
              set({ items });
            }
          }
        } catch (error) {
          console.error('Failed to sync trash items from Supabase:', error);
        }
      }
    }),
    {
      name: 'trash-store',
    }
  )
);
