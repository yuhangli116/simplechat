type RuntimeMaintenanceState = {
  phase?: 'normal' | 'announced' | 'locked'
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
  return '系统正在维护升级中，为避免数据丢失，登录、注册、AI创作等功能暂不可用，当前仅支持浏览，请稍后再试。'
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
