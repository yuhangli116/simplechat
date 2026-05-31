import { create } from 'zustand'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getEffectiveProfileDiamonds } from '@/services/billing'

const GUEST_BALANCE_KEY = 'guest-diamond-balance'
const GUEST_DEFAULT_BALANCE = 9999

const getGuestBalance = (): number => {
  if (typeof window === 'undefined') return GUEST_DEFAULT_BALANCE
  const raw = localStorage.getItem(GUEST_BALANCE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : GUEST_DEFAULT_BALANCE
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
    // GUEST MODE: If no user, read/write local guest balance for dev.
    if (!user) {
        const guestBalance = getGuestBalance()
        if (typeof window !== 'undefined') {
          localStorage.setItem(GUEST_BALANCE_KEY, String(guestBalance))
        }
        set({
            profile: {
                id: 'guest',
                username: '访客体验',
                avatar_url: '',
                membership_type: 'free',
                membership_expires_at: null,
                member_diamonds: 0,
                permanent_diamonds: guestBalance,
                diamond_balance: guestBalance
            },
            diamondBalance: guestBalance
        });
        return;
    }
    
    // Try to fetch profile
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
      
    if (error) {
        console.error('Error fetching profile:', error);
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
      console.log('Profile missing, creating new profile for user:', user.id);
      
      const newProfile = {
          id: user.id,
          username: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          avatar_url: user.user_metadata?.avatar_url || '',
          membership_type: 'free',
      };
      
      const { data: insertedData, error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .single();
          
      if (insertError) {
          console.error('Error creating missing profile:', insertError);
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
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null, diamondBalance: 0 })
  },
}))
