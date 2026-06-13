import { create } from 'zustand'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getEffectiveProfileDiamonds } from '@/services/billing'
import { createLogger } from '@/lib/logger'

const log = createLogger('Auth')

const GUEST_BALANCE_KEY = 'guest-diamond-balance'
const GUEST_SESSION_KEY = 'simplechat-guest-session'
const GUEST_DEFAULT_BALANCE = 0 // 游客不分配钻石
const NEW_USER_DIAMOND_BONUS = 50000 // 新用户注册赠送5w钻石
let inflightProfileUserId: string | null = null
let inflightProfilePromise: Promise<void> | null = null

const getGuestBalance = (): number => {
  if (typeof window === 'undefined') return GUEST_DEFAULT_BALANCE
  const raw = localStorage.getItem(GUEST_BALANCE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : GUEST_DEFAULT_BALANCE
}

// 判断当前用户是否为游客
export const isGuestUser = (user: User | null): boolean => {
  if (!user) return true
  return typeof user.id === 'string' && user.id.startsWith('guest-')
}

export const createGuestUser = (guestId: string): User => ({
  id: guestId,
  email: 'guest@simplechat.ai',
  aud: 'authenticated',
  role: 'authenticated',
} as User)

export const createGuestProfile = (guestId: string): Profile => ({
  id: guestId,
  username: '访客体验',
  avatar_url: '',
  membership_type: 'free',
  membership_expires_at: null,
  member_diamonds: 0,
  permanent_diamonds: 0,
  diamond_balance: 0,
})

export const saveGuestSession = (guestId: string) => {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ guestId, createdAt: Date.now() }))
}

export const loadGuestSession = (): { guestId: string; createdAt: number } | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(GUEST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.guestId || typeof parsed.guestId !== 'string' || !parsed.guestId.startsWith('guest-')) return null
    return { guestId: parsed.guestId, createdAt: Number(parsed.createdAt) || Date.now() }
  } catch {
    return null
  }
}

export const clearGuestSession = () => {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(GUEST_SESSION_KEY)
}

// 清理游客数据：重置文件树和清理所有 localStorage 缓存
const clearGuestData = () => {
  if (typeof window === 'undefined') return
  log.info('Clearing guest data...')

  // 需要清理的 localStorage key 前缀和具体 key
  const keyPrefixesToRemove = [
    'mindmap-',        // MindMapEditor 缓存: mindmap-${workId}-${type}, mindmap-${id}
    'mindmap-theme-',  // MindMapEditor 主题: mindmap-theme-${workId}-${type}
    'story-',          // StoryEditor 缓存: story-${workId}-${chapterId}, story-selected-model*
    'view-',           // MindMapEditor 视图状态
  ]
  const exactKeysToRemove = [
    'collectedSkills',       // 社区收藏
    'likedOfficialSkills',   // 社区点赞
    'officialSkillMetrics',  // 社区指标
    'likedTemplates',        // 作品模板点赞
    'collectedTemplates',    // 作品模板收藏
    'guestTemplateLikesDelta', // 游客对模板 likes 的修改量
    'guestTemplateViewsDelta', // 游客对模板 views 的修改量
    'likedSkillTemplates',    // 游客对数据库提示词模板的点赞
    'guest-diamond-balance', // 游客钻石余额
    'guest-storage-key',     // 游客存储标识
    'simplechat-guest-session', // 兼容误写入 localStorage 的游客会话
    'my-works-tree',         // useFileStore Zustand persist key
    'guest-my-works-tree',   // 游客 useFileStore Zustand persist key
    'my-prompts',            // usePromptStore Zustand persist key
    'trash-store',           // useTrashStore Zustand persist key
    'guest-trash-store',     // 游客 useTrashStore Zustand persist key
  ]

  let removedCount = 0
  try {
    // 先收集所有键（避免边删除边遍历时出问题
    const allKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        allKeys.push(key)
      }
    }

    // 然后再删除匹配的键
    const keysToRemove = allKeys.filter(key => 
      exactKeysToRemove.includes(key) || 
      keyPrefixesToRemove.some(prefix => key.startsWith(prefix))
    )

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
      removedCount++
      log.info('Removed localStorage key', { key })
    }
  } catch (e) {
    log.error('Failed to iterate localStorage for cleanup', { error: e })
  }

  // 清理可能残留的 sessionStorage
  try {
    sessionStorage.removeItem('guest-storage-key')
    clearGuestSession()
  } catch {}

  log.info('Guest data cleared', { removedCount })
}

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  membership_type: 'free' | 'monthly' | 'quarterly' | 'yearly';
  membership_expires_at?: string | null;
  member_diamonds?: number;
  permanent_diamonds?: number;
  diamond_balance: number;
  // The schema has word_balance, the store uses diamondBalance.
  // The mock in supabase.ts returned diamond_balance.
  // I will assume the column is diamond_balance or word_balance.
  // Looking at schema: word_balance integer default 0
  // Looking at store: select('diamond_balance')
  // This is a discrepancy! 
  // Schema: word_balance
  // Store: diamond_balance
  // I should check the schema file again carefully.
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  diamondBalance: number;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setDiamondBalance: (balance: number) => void;
  fetchProfile: () => Promise<void>;
  fetchBalance: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: false, // Changed from true to false for faster dev load
  diamondBalance: 0,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setDiamondBalance: (balance) => set({ diamondBalance: balance }),
  fetchBalance: async () => {
    await get().fetchProfile();
  },
  fetchProfile: async () => {
    const { user } = get();
    // GUEST MODE: 游客不分配钻石
    if (!user || isGuestUser(user)) {
        set({
            profile: {
                id: user?.id || 'guest',
                username: '访客体验',
                avatar_url: '',
                membership_type: 'free',
                membership_expires_at: null,
                member_diamonds: 0,
                permanent_diamonds: 0,
                diamond_balance: 0
            },
            diamondBalance: 0
        });
        return;
    }

    if (inflightProfilePromise && inflightProfileUserId === user.id) {
      return inflightProfilePromise
    }

    inflightProfileUserId = user.id
    inflightProfilePromise = (async () => {
      const profileFetchStartedAt = performance.now()
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      console.log('[Auth Timing] fetchProfile query ms:', Math.round(performance.now() - profileFetchStartedAt))
        
      if (error) {
          log.error('Error fetching profile', { userId: user.id, error: error.message })
          return;
      }
        
      if (data) {
        const effective = getEffectiveProfileDiamonds({
          member_diamonds: data.member_diamonds,
          permanent_diamonds:
            data.permanent_diamonds !== undefined
              ? Number(data.permanent_diamonds)
              : data.diamond_balance !== undefined
                ? Number(data.diamond_balance)
                : Number(data.word_balance ?? 0),
          membership_type: data.membership_type,
          membership_expires_at: data.membership_expires_at,
        });
        
        set({ 
          profile: {
              ...data,
              membership_type: effective.membershipType as Profile['membership_type'],
              membership_expires_at: effective.membershipExpiresAt,
              member_diamonds: effective.memberDiamonds,
              permanent_diamonds: effective.permanentDiamonds,
              diamond_balance: effective.totalDiamonds
          }, 
          diamondBalance: effective.totalDiamonds || 0 
        });
      } else {
        // Profile missing! Create it.
        log.info('Profile missing, creating new profile', { userId: user.id });
        
        const newProfile = {
            id: user.id,
            username: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            avatar_url: user.user_metadata?.avatar_url || '',
            membership_type: 'free',
            permanent_diamonds: NEW_USER_DIAMOND_BONUS,
            diamond_balance: NEW_USER_DIAMOND_BONUS,
        };
        
        const { data: insertedData, error: insertError } = await supabase
            .from('profiles')
            .insert([newProfile])
            .select()
            .single();
            
        if (insertError) {
            log.error('Error creating missing profile', { userId: user.id, error: insertError.message });
        } else if (insertedData) {
             const effective = getEffectiveProfileDiamonds({
               member_diamonds: insertedData.member_diamonds,
               permanent_diamonds:
                 insertedData.permanent_diamonds !== undefined
                   ? Number(insertedData.permanent_diamonds)
                   : insertedData.diamond_balance !== undefined
                     ? Number(insertedData.diamond_balance)
                     : Number(insertedData.word_balance ?? 0),
               membership_type: insertedData.membership_type,
               membership_expires_at: insertedData.membership_expires_at,
             });
             set({ 
               profile: {
                   ...insertedData,
                   membership_type: effective.membershipType as Profile['membership_type'],
                   membership_expires_at: effective.membershipExpiresAt,
                   member_diamonds: effective.memberDiamonds,
                   permanent_diamonds: effective.permanentDiamonds,
                   diamond_balance: effective.totalDiamonds
               }, 
               diamondBalance: effective.totalDiamonds || 0 
             });
        }
      }
    })().finally(() => {
      inflightProfileUserId = null
      inflightProfilePromise = null
    })

    return inflightProfilePromise
  },
  signOut: async () => {
    const currentUser = get().user
    const wasGuest = isGuestUser(currentUser)
    log.info('User signing out', { wasGuest, userId: currentUser?.id })

    // 先清理 localStorage 缓存（在 user 置空之前，确保能正确识别游客）
    if (wasGuest) {
      clearGuestData()
    }

    // 重置 auth 状态
    set({ user: null, session: null, profile: null, diamondBalance: 0 })

    // 重置其他 store 的内存状态
    try {
      const { useFileStore, initialFileStructure } = await import('./useFileStore')
      const { usePromptStore } = await import('./usePromptStore')
      const { useTrashStore } = await import('./useTrashStore')
      useFileStore.setState({ files: initialFileStructure, createWorkInProgress: false })
      usePromptStore.setState({ prompts: [] })
      useTrashStore.setState({ items: [] })
      if (wasGuest) {
        usePromptStore.persist?.clearStorage?.()
        useTrashStore.persist?.clearStorage?.()
      }
      log.info('Stores reset completed', { wasGuest })
    } catch (e) {
      log.error('Failed to reset stores', { error: e })
    }
    try {
      await supabase.auth.signOut()
    } catch {
      return
    }
  },
}))
