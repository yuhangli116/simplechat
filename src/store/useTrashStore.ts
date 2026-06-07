import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { useAuthStore, isGuestUser } from './useAuthStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('Trash');

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

const isMissingTrashTableError = (error: any) =>
  error?.code === 'PGRST205' || error?.status === 404;

let trashSyncCapability: boolean | null = null;

const canSyncTrash = () => trashSyncCapability === true;

const shouldProbeTrashSync = () => trashSyncCapability !== false;

const setTrashSyncCapability = (available: boolean) => {
  trashSyncCapability = available;
};

const handleTrashSyncError = (error: any, action: string) => {
  if (!error) {
    setTrashSyncCapability(true);
    return false;
  }

  if (isMissingTrashTableError(error)) {
    setTrashSyncCapability(false);
    log.warn('Supabase trash sync disabled: trash_items table missing');
    return true;
  }

  log.error(`Failed to ${action}`, { error: error?.message });
  return true;
};

interface TrashState {
  items: TrashItem[];
  addExistingItem: (item: TrashItem) => void;
  addToTrash: (item: Omit<TrashItem, 'id' | 'deletedAt' | 'expiresAt'>) => Promise<void>;
  getTrashItem: (id: string) => Promise<TrashItem | null>;
  permanentlyDelete: (id: string) => Promise<void>;
  clearTrash: () => Promise<void>;
  clearExpired: () => Promise<void>;
  syncFromSupabase: () => Promise<void>;
}

const EXPIRATION_DAYS = 30;

export const useTrashStore = create<TrashState>()(
  persist(
    (set, get) => ({
      items: [],
      addExistingItem: (item) => {
        set((state) => {
          const existing = state.items.some((i) => i.id === item.id);
          return existing ? state : { items: [item, ...state.items] };
        });
      },
      
      addToTrash: async (item) => {
        log.info('Adding item to trash', { type: item.type, title: item.title });
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
          if (user && !isGuestUser(user) && canSyncTrash()) {
            const { error } = await supabase.from('trash_items').insert({
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

            handleTrashSyncError(error, 'sync trash item to Supabase');
          }
        } catch (error) {
          handleTrashSyncError(error, 'sync trash item to Supabase');
        }
      },

      getTrashItem: async (id: string) => {
        const state = get();
        let item = state.items.find(i => i.id === id);

        if (!item) {
          try {
            const user = useAuthStore.getState().user;
            if (user && !isGuestUser(user) && canSyncTrash()) {
              const { data, error } = await supabase
                .from('trash_items')
                .select('*')
                .eq('id', id)
                .eq('user_id', user.id)
                .maybeSingle();

              if (handleTrashSyncError(error, 'fetch trash item from Supabase')) {
                return null;
              }

              if (data) {
                const fetchedItem: TrashItem = {
                  id: data.id,
                  originalId: data.original_id,
                  type: data.type,
                  title: data.title,
                  content: data.content,
                  deletedAt: data.deleted_at,
                  expiresAt: data.expires_at,
                  originalPath: data.original_path,
                  parentId: data.parent_id,
                  workName: data.work_name,
                  extra: data.extra
                };
                item = fetchedItem;
                set((state) => ({
                  items: [fetchedItem, ...state.items]
                }));
              }
            }
          } catch (error) {
            handleTrashSyncError(error, 'fetch trash item from Supabase');
          }
        }

        return item || null;
      },

      permanentlyDelete: async (id) => {
        log.info('Permanently deleting trash item', { id });
        set((state) => ({
          items: state.items.filter(i => i.id !== id)
        }));
        
        try {
          const user = useAuthStore.getState().user;
          if (user && !isGuestUser(user) && canSyncTrash()) {
            const { error } = await supabase.from('trash_items').delete().eq('id', id).eq('user_id', user.id);
            handleTrashSyncError(error, 'delete trash item from Supabase');
          }
        } catch (error) {
          handleTrashSyncError(error, 'delete trash item from Supabase');
        }
      },

      clearTrash: async () => {
        log.info('Clearing all trash items');
        set({ items: [] });
        
        try {
          const user = useAuthStore.getState().user;
          if (user && !isGuestUser(user) && canSyncTrash()) {
            const { error } = await supabase.from('trash_items').delete().eq('user_id', user.id);
            handleTrashSyncError(error, 'clear trash from Supabase');
          }
        } catch (error) {
          handleTrashSyncError(error, 'clear trash from Supabase');
        }
      },

      clearExpired: async () => {
        const now = Date.now();
        const state = get();
        const expiredIds = state.items.filter(i => i.expiresAt <= now).map(i => i.id);
        
        if (expiredIds.length > 0) {
          log.info('Clearing expired trash items', { count: expiredIds.length });
          set((state) => ({
            items: state.items.filter(i => i.expiresAt > now)
          }));
          
          try {
            const user = useAuthStore.getState().user;
            if (user && !isGuestUser(user) && canSyncTrash()) {
              const { error } = await supabase.from('trash_items').delete().in('id', expiredIds).eq('user_id', user.id);
              handleTrashSyncError(error, 'clear expired trash from Supabase');
            }
          } catch (error) {
            handleTrashSyncError(error, 'clear expired trash from Supabase');
          }
        }
      },
      
      // Sync from Supabase on load
      syncFromSupabase: async () => {
        log.info('Syncing trash items from Supabase');
        try {
          const user = useAuthStore.getState().user;
          if (user && !isGuestUser(user) && shouldProbeTrashSync()) {
            const { data, error } = await supabase
              .from('trash_items')
              .select('*')
              .eq('user_id', user.id)
              .order('deleted_at', { ascending: false });

            if (handleTrashSyncError(error, 'sync trash items from Supabase')) {
              return;
            }

            if (data) {
              const items: TrashItem[] = data.map((d: any) => ({
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
          handleTrashSyncError(error, 'sync trash items from Supabase');
        }
      }
    }),
    {
      name: 'trash-store',
    }
  )
);
