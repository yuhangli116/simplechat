import { supabase } from '@/lib/supabase'
import { createLogger } from '@/lib/logger'

const log = createLogger('Security')

export type SecurityCheckResult = {
  blocked: boolean
  userStatus: 'normal' | 'limited' | 'blacklisted' | string
  userReason: string
  userLimits: Record<string, unknown>
  ipStatus: 'normal' | 'limited' | 'blocked' | string
  ipReason: string
  ipLimits: Record<string, unknown>
  unavailable?: boolean
}

const normalResult: SecurityCheckResult = {
  blocked: false,
  userStatus: 'normal',
  userReason: '',
  userLimits: {},
  ipStatus: 'normal',
  ipReason: '',
  ipLimits: {},
}

const unwrapRpcData = (data: unknown): Record<string, unknown> => {
  if (data && typeof data === 'object' && 'data' in data) {
    const wrapped = data as { data?: unknown }
    return wrapped.data && typeof wrapped.data === 'object' ? wrapped.data as Record<string, unknown> : {}
  }
  return data && typeof data === 'object' ? data as Record<string, unknown> : {}
}

export const checkCurrentUserSecurity = async (userId: string): Promise<SecurityCheckResult> => {
  if (!userId) return normalResult

  const { data, error } = await supabase.rpc('admin_security_check', {
    p_user_id: userId,
    p_ip_address: null,
  })

  if (error) {
    log.warn('Security check unavailable; allowing session with RLS fallback', {
      userId,
      error: error.message,
    })
    return { ...normalResult, userStatus: 'unknown', ipStatus: 'unknown', unavailable: true }
  }

  const result = unwrapRpcData(data)
  return {
    blocked: Boolean(result.blocked),
    userStatus: String(result.user_status || 'normal'),
    userReason: String(result.user_reason || ''),
    userLimits: result.user_limits && typeof result.user_limits === 'object' ? result.user_limits as Record<string, unknown> : {},
    ipStatus: String(result.ip_status || 'normal'),
    ipReason: String(result.ip_reason || ''),
    ipLimits: result.ip_limits && typeof result.ip_limits === 'object' ? result.ip_limits as Record<string, unknown> : {},
  }
}
