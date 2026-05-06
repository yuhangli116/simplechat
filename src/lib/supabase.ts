import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseInstance: SupabaseClient<Database> | any;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing or invalid Supabase URL/Key. Using mock client.')
  
  // Mock Chainable Implementation for Database Queries
  const createMockChain = (table?: string) => {
    // Return a proxy that handles method chaining
    const handler: any = {
      get: (target: any, prop: string) => {
        // If 'then' is accessed, it means we're being awaited
        if (prop === 'then') {
          return (resolve: any) => {
            // Mock responses based on table
            if (table === 'profiles') {
               resolve({ data: { diamond_balance: 100, full_name: '测试用户', avatar_url: '' }, error: null });
            } else if (table === 'community_templates') {
               resolve({ data: [], error: null });
            } else if (table === 'tutorials') {
               resolve({ data: [], error: null });
            } else if (table === 'app_versions') {
               resolve({ data: [], error: null });
            } else {
               resolve({ data: null, error: null });
            }
          };
        }
        
        // Return a function for method calls like .select(), .eq(), etc.
        // This function returns the proxy itself to continue the chain
        return (...args: any[]) => {
            return new Proxy(() => {}, handler);
        };
      }
    };
    return new Proxy(() => {}, handler);
  };

  supabaseInstance = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ 
        data: { 
          user: { id: 'mock-user-id', email: 'test@example.com' }, 
          session: { access_token: 'mock-token', user: { id: 'mock-user-id', email: 'test@example.com' } } 
        }, 
        error: null 
      }),
      signUp: async () => ({ 
        data: { 
          user: { id: 'mock-user-id', email: 'test@example.com' }, 
          session: { access_token: 'mock-token', user: { id: 'mock-user-id', email: 'test@example.com' } } 
        }, 
        error: null 
      }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'mock-user-id', email: 'test@example.com' } }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
    },
    from: (table: string) => createMockChain(table),
    storage: {
      from: () => createMockChain()
    },
    functions: {
      invoke: async () => ({ data: null, error: null })
    }
  }
} else {
  supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey)
}

export const supabase = supabaseInstance;