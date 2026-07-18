import { supabase } from '@/lib/supabase'
import { createLogger } from '@/lib/logger'

const log = createLogger('Maintenance')

export type MaintenancePhase = 'normal' | 'announced' | 'locked'

export type SiteMaintenanceState = {
  enabled: boolean
  phase: MaintenancePhase
  planned_start_at: string | null
  planned_end_at: string | null
  announce_at: string | null
  lock_at: string | null
  notice_title: string
  notice_text: string
  lock_lead_minutes: number
  announce_lead_minutes: number
  server_now: string
}

export const DEFAULT_MAINTENANCE_STATE: SiteMaintenanceState = {
  enabled: false,
  phase: 'normal',
  planned_start_at: null,
  planned_end_at: null,
  announce_at: null,
  lock_at: null,
  notice_title: '系统维护升级通知',
  notice_text: '本系统预计将在稍后开始进行系统维护升级，届时网站暂时不对外开放，请各位用户谅解。',
  lock_lead_minutes: 30,
  announce_lead_minutes: 2880,
  server_now: new Date().toISOString(),
}

let cachedMaintenanceState = DEFAULT_MAINTENANCE_STATE

const normalizeState = (raw: unknown): SiteMaintenanceState => {
  const next = (raw && typeof raw === 'object' && 'data' in raw
    ? (raw as { data?: unknown }).data
    : raw) as Record<string, unknown> | null

  if (!next || typeof next !== 'object') {
    return cachedMaintenanceState
  }

  const state: SiteMaintenanceState = {
    enabled: Boolean(next.enabled),
    phase: next.phase === 'announced' || next.phase === 'locked' ? next.phase : 'normal',
    planned_start_at: typeof next.planned_start_at === 'string' ? next.planned_start_at : null,
    planned_end_at: typeof next.planned_end_at === 'string' ? next.planned_end_at : null,
    announce_at: typeof next.announce_at === 'string' ? next.announce_at : null,
    lock_at: typeof next.lock_at === 'string' ? next.lock_at : null,
    notice_title: typeof next.notice_title === 'string' && next.notice_title.trim() ? next.notice_title : DEFAULT_MAINTENANCE_STATE.notice_title,
    notice_text: typeof next.notice_text === 'string' && next.notice_text.trim() ? next.notice_text : DEFAULT_MAINTENANCE_STATE.notice_text,
    lock_lead_minutes: Number(next.lock_lead_minutes ?? DEFAULT_MAINTENANCE_STATE.lock_lead_minutes) || DEFAULT_MAINTENANCE_STATE.lock_lead_minutes,
    announce_lead_minutes: Number(next.announce_lead_minutes ?? DEFAULT_MAINTENANCE_STATE.announce_lead_minutes) || DEFAULT_MAINTENANCE_STATE.announce_lead_minutes,
    server_now: typeof next.server_now === 'string' ? next.server_now : new Date().toISOString(),
  }

  cachedMaintenanceState = state
  return state
}

export async function fetchMaintenanceState(): Promise<SiteMaintenanceState> {
  const rpcClient = supabase as typeof supabase & {
    rpc?: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }

  if (typeof rpcClient.rpc !== 'function') {
    return cachedMaintenanceState
  }

  try {
    const { data, error } = await rpcClient.rpc('get_site_maintenance_state')
    if (error) {
      throw new Error(error.message)
    }
    return normalizeState(data)
  } catch (error) {
    log.warn('Failed to load site maintenance state', {
      error: error instanceof Error ? error.message : String(error),
    })
    return cachedMaintenanceState
  }
}

export function setCachedMaintenanceState(state: SiteMaintenanceState) {
  cachedMaintenanceState = state
}

export function isMaintenanceBannerVisible(state: SiteMaintenanceState) {
  return state.phase === 'announced' || state.phase === 'locked'
}

export function getMaintenanceNextRefreshDelayMs(state: SiteMaintenanceState) {
  const serverNowMs = Date.parse(state.server_now || '')
  const fallbackDelay = state.phase === 'locked' ? 30_000 : state.phase === 'announced' ? 10_000 : 60_000
  const clamp = (ms: number) => Math.max(3_000, Math.min(ms, 60_000))
  const diff = (target: string | null) => {
    if (!target || !Number.isFinite(serverNowMs)) return fallbackDelay
    return Date.parse(target) - serverNowMs
  }

  if (state.phase === 'locked') return clamp(diff(state.planned_end_at))
  if (state.phase === 'announced') return clamp(diff(state.lock_at))
  if (state.enabled && state.announce_at) return clamp(diff(state.announce_at))
  return fallbackDelay
}

export function formatMaintenanceDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

