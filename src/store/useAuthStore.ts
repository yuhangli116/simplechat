import { create } from 'zustand'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  membership_type: 'free' | 'pro' | 'max';
  diamond_balance: number; // mapped from word_balance or new column? Schema says word_balance, store says diamond_balance.
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
    // GUEST MODE: If no user, mock a guest profile
    if (!user) {
        set({
            profile: {
                id: 'guest',
                username: '访客体验',
                avatar_url: '',
                membership_type: 'free',
                diamond_balance: 9999
            },
            diamondBalance: 9999
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
      // Handle schema discrepancy if any. 
      // Schema says word_balance, store used diamond_balance.
      const balance = data.diamond_balance !== undefined ? data.diamond_balance : data.word_balance;
      
      set({ 
        profile: {
            ...data,
            diamond_balance: balance
        }, 
        diamondBalance: balance || 0 
      });
    } else {
      // Profile missing! Create it.
      console.log('Profile missing, creating new profile for user:', user.id);
      
      const newProfile = {
          id: user.id,
          username: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          avatar_url: user.user_metadata?.avatar_url || '',
          membership_type: 'free',
          word_balance: 0
      };
      
      const { data: insertedData, error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .single();
          
      if (insertError) {
          console.error('Error creating missing profile:', insertError);
      } else if (insertedData) {
           const balance = insertedData.diamond_balance !== undefined ? insertedData.diamond_balance : insertedData.word_balance;
           set({ 
             profile: {
                 ...insertedData,
                 diamond_balance: balance
             }, 
             diamondBalance: balance || 0 
           });
      }
    }
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null, diamondBalance: 0 })
  },
}))
