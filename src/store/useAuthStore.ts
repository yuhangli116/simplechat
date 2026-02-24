import { create } from 'zustand'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  diamondBalance: number;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setDiamondBalance: (balance: number) => void;
  fetchBalance: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  diamondBalance: 0,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setDiamondBalance: (balance) => set({ diamondBalance: balance }),
  fetchBalance: async () => {
    const { user } = get();
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('diamond_balance')
      .eq('id', user.id)
      .single();
      
    if (data) {
      set({ diamondBalance: data.diamond_balance });
    }
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, diamondBalance: 0 })
  },
}))
