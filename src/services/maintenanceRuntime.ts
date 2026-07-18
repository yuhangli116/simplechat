type RuntimeMaintenanceState = {
  phase?: 'normal' | 'announced' | 'locked'
  lock_at?: string | null
  planned_end_at?: string | null
}

let currentState: RuntimeMaintenanceState = { phase: 'normal' }

export function setMaintenanceRuntimeState(state: RuntimeMaintenanceState) {
  currentState = state
}

export function isMaintenanceRuntimeLocked() {
  return currentState.phase === 'locked'
}

export function getMaintenanceRuntimeBlockedMessage() {
  const lockAt = formatRuntimeDate(currentState.lock_at)
  const endAt = formatRuntimeDate(currentState.planned_end_at)
  if (lockAt !== '-' || endAt !== '-') {
    return `系统正在维护升级中，部分功能暂不可用，当前仅支持浏览。系统自 ${lockAt} 开始升级，预计 ${endAt} 恢复，请稍后再试。`
  }
  return '系统正在维护升级中，部分功能暂不可用，当前仅支持浏览，请稍后再试。'
}

function formatRuntimeDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

function isSafeAuthRequest(url: string, method: string) {
  try {
    const pathname = new URL(url, window.location.origin).pathname
    return method === 'POST' && pathname.endsWith('/auth/v1/logout')
  } catch {
    return false
  }
}

export function shouldBlockMaintenanceRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (!isMaintenanceRuntimeLocked()) return false

  const method = getRequestMethod(input, init)
  const url = getRequestUrl(input)
  if (isSafeAuthRequest(url, method)) return false

  return true
}

export function createMaintenanceBlockedResponse() {
  return new Response(
    JSON.stringify({
      message: getMaintenanceRuntimeBlockedMessage(),
      error: getMaintenanceRuntimeBlockedMessage(),
      code: 'MAINTENANCE_LOCKED',
      details: null,
      hint: null,
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': '60',
      },
    },
  )
}
