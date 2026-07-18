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
  lock_lead_minutes: 60,
  announce_lead_minutes: 2880,
  server_now: new Date().toISOString(),
}

let cachedMaintenanceState = DEFAULT_MAINTENANCE_STATE

const MAINTENANCE_CONFIG_KEYS = [
  'site_maintenance_enabled',
  'site_maintenance_planned_start_at',
  'site_maintenance_planned_end_at',
  'site_maintenance_notice_title',
  'site_maintenance_notice_text',
  'site_maintenance_lock_lead_minutes',
  'site_maintenance_announce_lead_minutes',
]

type SystemConfigRow = {
  key: string
  value: string
}

type MaintenanceWindowRow = {
  enabled: boolean
  planned_start_at: string | null
  planned_end_at: string | null
  notice_title: string | null
  notice_text: string | null
  lock_lead_minutes: number | null
  announce_lead_minutes: number | null
  updated_at: string | null
}

const getConfigValue = (rows: SystemConfigRow[], key: string) =>
  rows.find((row) => row.key === key)?.value

const isRpcMissingError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('Could not find the function') || message.includes('schema cache')
}

const derivePhase = (state: SiteMaintenanceState): MaintenancePhase => {
  if (!state.enabled || !state.planned_start_at || !state.planned_end_at) return 'normal'

  const now = Date.parse(state.server_now)
  const plannedEnd = Date.parse(state.planned_end_at)
  const lockAt = Date.parse(state.lock_at || '')
  const announceAt = Date.parse(state.announce_at || '')

  if (!Number.isFinite(now) || !Number.isFinite(plannedEnd) || !Number.isFinite(lockAt) || !Number.isFinite(announceAt)) {
    return 'normal'
  }
  if (now >= plannedEnd) return 'normal'
  if (now >= lockAt) return 'locked'
  if (now >= announceAt) return 'announced'
  return 'normal'
}

const stateFromSystemConfig = (rows: SystemConfigRow[]): SiteMaintenanceState => {
  const plannedStartAt = getConfigValue(rows, 'site_maintenance_planned_start_at') || null
  const plannedEndAt = getConfigValue(rows, 'site_maintenance_planned_end_at') || null
  const lockLeadMinutes = Number(getConfigValue(rows, 'site_maintenance_lock_lead_minutes') || DEFAULT_MAINTENANCE_STATE.lock_lead_minutes)
  const announceLeadMinutes = Number(getConfigValue(rows, 'site_maintenance_announce_lead_minutes') || DEFAULT_MAINTENANCE_STATE.announce_lead_minutes)
  const plannedStartMs = plannedStartAt ? Date.parse(plannedStartAt) : NaN
  const announceAt = Number.isFinite(plannedStartMs) ? new Date(plannedStartMs - announceLeadMinutes * 60_000).toISOString() : null
  const lockAt = Number.isFinite(plannedStartMs) ? new Date(plannedStartMs - lockLeadMinutes * 60_000).toISOString() : null

  const state: SiteMaintenanceState = {
    enabled: getConfigValue(rows, 'site_maintenance_enabled') === 'true',
    phase: 'normal',
    planned_start_at: plannedStartAt,
    planned_end_at: plannedEndAt,
    announce_at: announceAt,
    lock_at: lockAt,
    notice_title: getConfigValue(rows, 'site_maintenance_notice_title') || DEFAULT_MAINTENANCE_STATE.notice_title,
    notice_text: getConfigValue(rows, 'site_maintenance_notice_text') || DEFAULT_MAINTENANCE_STATE.notice_text,
    lock_lead_minutes: Number.isFinite(lockLeadMinutes) ? lockLeadMinutes : DEFAULT_MAINTENANCE_STATE.lock_lead_minutes,
    announce_lead_minutes: Number.isFinite(announceLeadMinutes) ? announceLeadMinutes : DEFAULT_MAINTENANCE_STATE.announce_lead_minutes,
    server_now: new Date().toISOString(),
  }

  state.phase = derivePhase(state)
  cachedMaintenanceState = state
  return state
}

const stateFromMaintenanceWindow = (row: MaintenanceWindowRow | null): SiteMaintenanceState => {
  if (!row) {
    return {
      ...DEFAULT_MAINTENANCE_STATE,
      server_now: new Date().toISOString(),
    }
  }

  const plannedStartAt = row.planned_start_at
  const plannedEndAt = row.planned_end_at
  const lockLeadMinutes = Number(row.lock_lead_minutes ?? DEFAULT_MAINTENANCE_STATE.lock_lead_minutes)
  const announceLeadMinutes = Number(row.announce_lead_minutes ?? DEFAULT_MAINTENANCE_STATE.announce_lead_minutes)
  const plannedStartMs = plannedStartAt ? Date.parse(plannedStartAt) : NaN
  const announceAt = Number.isFinite(plannedStartMs) ? new Date(plannedStartMs - announceLeadMinutes * 60_000).toISOString() : null
  const lockAt = Number.isFinite(plannedStartMs) ? new Date(plannedStartMs - lockLeadMinutes * 60_000).toISOString() : null

  const state: SiteMaintenanceState = {
    enabled: Boolean(row.enabled),
    phase: 'normal',
    planned_start_at: plannedStartAt,
    planned_end_at: plannedEndAt,
    announce_at: announceAt,
    lock_at: lockAt,
    notice_title: row.notice_title || DEFAULT_MAINTENANCE_STATE.notice_title,
    notice_text: row.notice_text || DEFAULT_MAINTENANCE_STATE.notice_text,
    lock_lead_minutes: Number.isFinite(lockLeadMinutes) ? lockLeadMinutes : DEFAULT_MAINTENANCE_STATE.lock_lead_minutes,
    announce_lead_minutes: Number.isFinite(announceLeadMinutes) ? announceLeadMinutes : DEFAULT_MAINTENANCE_STATE.announce_lead_minutes,
    server_now: new Date().toISOString(),
  }

  state.phase = derivePhase(state)
  cachedMaintenanceState = state
  return state
}

async function fetchMaintenanceStateFromWindowTable() {
  const queryClient = supabase as typeof supabase & {
    from?: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => Promise<{ data: MaintenanceWindowRow[] | null; error: { message: string } | null }>
        }
      }
    }
  }

  if (typeof queryClient.from !== 'function') return cachedMaintenanceState

  const { data, error } = await queryClient
    .from('site_maintenance_windows')
    .select('enabled,planned_start_at,planned_end_at,notice_title,notice_text,lock_lead_minutes,announce_lead_minutes,updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  const row = data?.[0] || null
  return row ? stateFromMaintenanceWindow(row) : null
}

async function fetchMaintenanceStateFromSystemConfig() {
  const queryClient = supabase as typeof supabase & {
    from?: (table: string) => {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{ data: SystemConfigRow[] | null; error: { message: string } | null }>
      }
    }
  }

  if (typeof queryClient.from !== 'function') return cachedMaintenanceState

  const { data, error } = await queryClient
    .from('system_config')
    .select('key,value')
    .in('key', MAINTENANCE_CONFIG_KEYS)

  if (error) {
    throw new Error(error.message)
  }

  return stateFromSystemConfig(data || [])
}

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

  try {
    const response = await fetch('/api/site-maintenance-state', { credentials: 'same-origin' })
    if (response.ok) {
      const localState = normalizeState(await response.json())
      if (localState) {
        return localState
      }
    }
  } catch (error) {
    log.warn('Failed to load site maintenance state from local server bridge', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    const windowState = await fetchMaintenanceStateFromWindowTable()
    if (windowState) return windowState
  } catch (tableError) {
    log.warn('Failed to load site maintenance state from window table', {
      error: tableError instanceof Error ? tableError.message : String(tableError),
    })
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
    if (isRpcMissingError(error)) {
      try {
        return await fetchMaintenanceStateFromSystemConfig()
      } catch (fallbackError) {
        log.warn('Failed to load site maintenance state from system_config fallback', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        })
      }
    }
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

export function getMaintenanceBannerMessage(state: SiteMaintenanceState) {
  const startAt = formatMaintenanceDate(state.planned_start_at)
  const lockAt = formatMaintenanceDate(state.lock_at)

  if (state.phase === 'locked') {
    return `封禁保护期：系统正在升级维护中，为避免数据丢失，登录、注册、查询、保存、新增、修改、删除、AI 创作等远程功能暂时不可用。您仍可停留在当前页面查看已加载内容，刷新或切换页面会回到登录页，预计 ${formatMaintenanceDate(state.planned_end_at)} 恢复，请各位用户谅解。`
  }

  return `升级预告：系统预计将在 ${startAt} 开始进行维护升级，${lockAt} 起进入封禁保护期。当前功能仍可正常使用，请提前做好安排。`
}
