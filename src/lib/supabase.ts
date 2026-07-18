import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'
import { createLogger } from '@/lib/logger'
import { createMaintenanceBlockedResponse, shouldBlockMaintenanceRequest } from '@/services/maintenanceRuntime'

const log = createLogger('Supabase')

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseInstance: SupabaseClient<Database> | any;

if (!supabaseUrl || !supabaseAnonKey) {
  log.warn('Missing Supabase URL/Key, using mock client')
  
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
  log.info('Supabase client initialized', { url: supabaseUrl?.slice(0, 30) })
  const guardedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (shouldBlockMaintenanceRequest(input, init)) {
      log.warn('Blocked Supabase request during maintenance lock', {
        url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : String(input),
        method: init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET'),
      })
      return createMaintenanceBlockedResponse()
    }

    return fetch(input, init)
  }

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: guardedFetch as typeof fetch,
    },
  })
}

export const supabase = supabaseInstance;
