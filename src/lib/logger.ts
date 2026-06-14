/**
 * 统一日志工具
 *
 * 使用方式：
 *   import { createLogger } from '@/lib/logger'
 *   const log = createLogger('模块名')
 *   log.info('操作描述', { key: value })
 *   log.success('操作成功', { key: value })
 *   log.warn('警告信息', { key: value })
 *   log.error('错误信息', { key: value }, error)
 *
 * 浏览器控制台输出格式：
 *   [模块名] ℹ 操作描述 { key: value }
 *   [模块名] ✔ 操作成功 { key: value }
 *   [模块名] ⚠ 警告信息 { key: value }
 *   [模块名] ✘ 错误信息 { key: value } Error: ...
 *
 * 服务端持久化：
 *   日志自动批量发送到 /api/log 端点，由服务端写入 simplechat/log/ 目录
 *   运行中始终续写 simplechat.log，达到 1GB 后轮转为 simplechat.log.YYYYMMDD_HHmm
 *   目录总大小最大 5GB，超出自动清理最老的轮转日志
 */

type LogLevel = 'info' | 'success' | 'warn' | 'error'

const LEVEL_STYLES: Record<LogLevel, string> = {
  info: 'color: #3b82f6; font-weight: bold;',
  success: 'color: #22c55e; font-weight: bold;',
  warn: 'color: #f59e0b; font-weight: bold;',
  error: 'color: #ef4444; font-weight: bold;',
}

const LEVEL_ICONS: Record<LogLevel, string> = {
  info: 'ℹ',
  success: '✔',
  warn: '⚠',
  error: '✘',
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INFO',
  success: 'SUCCESS',
  warn: 'WARN',
  error: 'ERROR',
}

const MODULE_COLORS = [
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#10b981',
  '#6366f1', '#14b8a6', '#e11d48', '#84cc16', '#a855f7',
]

function getModuleColor(moduleName: string): string {
  let hash = 0
  for (let i = 0; i < moduleName.length; i++) {
    hash = moduleName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return MODULE_COLORS[Math.abs(hash) % MODULE_COLORS.length]
}

// ─── 日志持久化：批量发送到服务端 ───

interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
  error?: string
}

const PERSIST_BUFFER: LogEntry[] = []
const PERSIST_INTERVAL_MS = 1000 // 每 1 秒批量发送一次
const PERSIST_MAX_BUFFER = 50 // 缓冲区最大条数，超出立即发送
let persistTimer: ReturnType<typeof setInterval> | null = null
let persistInProgress = false
let persistListenersAttached = false
let pendingFlush: { batch: LogEntry[]; useBeacon: boolean } | null = null

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

function sendLogs(batch: LogEntry[], useBeacon = false): Promise<void> | void {
  const payload = JSON.stringify({ logs: batch })

  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const sent = navigator.sendBeacon('/api/log', new Blob([payload], { type: 'application/json' }))
    if (sent) return
  }

  return fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).then(() => undefined)
}

export function flushLogs(useBeacon = false): void {
  if (PERSIST_BUFFER.length === 0) return
  if (persistInProgress) {
    const buffered = PERSIST_BUFFER.splice(0, PERSIST_BUFFER.length)
    if (useBeacon) {
      void sendLogs(buffered, true)
      return
    }
    if (pendingFlush) {
      pendingFlush.batch.push(...buffered)
      pendingFlush.useBeacon = pendingFlush.useBeacon || useBeacon
    } else {
      pendingFlush = { batch: buffered, useBeacon }
    }
    return
  }

  const batch = PERSIST_BUFFER.splice(0, PERSIST_BUFFER.length)
  persistInProgress = true

  Promise.resolve(sendLogs(batch, useBeacon)).catch(() => {
    // 发送失败，将日志放回缓冲区（最多保留 PERSIST_MAX_BUFFER 条）
    const overflow = batch.length + PERSIST_BUFFER.length - PERSIST_MAX_BUFFER * 2
    if (overflow > 0) {
      PERSIST_BUFFER.splice(0, overflow)
    }
    PERSIST_BUFFER.unshift(...batch.slice(-PERSIST_MAX_BUFFER))
  }).finally(() => {
    persistInProgress = false
    if (pendingFlush) {
      const pending = pendingFlush
      pendingFlush = null
      PERSIST_BUFFER.unshift(...pending.batch)
      flushLogs(pending.useBeacon)
    }
  })
}

function persistLog(entry: LogEntry): void {
  PERSIST_BUFFER.push(entry)

  // 缓冲区满时立即发送
  if (PERSIST_BUFFER.length >= PERSIST_MAX_BUFFER) {
    flushLogs()
    return
  }

  // 启动定时器
  if (!persistTimer) {
    persistTimer = setInterval(() => flushLogs(), PERSIST_INTERVAL_MS)
    // 页面关闭前发送剩余日志
    if (typeof window !== 'undefined' && !persistListenersAttached) {
      const flushBeforePageLeaves = () => flushLogs(true)
      window.addEventListener('beforeunload', flushBeforePageLeaves)
      window.addEventListener('pagehide', flushBeforePageLeaves)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          flushLogs(true)
        }
      })
      persistListenersAttached = true
    }
  }
}

// ─── Logger 接口 ───

interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void
  success: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>, error?: unknown) => void
  group: (label: string, fn: () => void) => void
}

export function createLogger(module: string): Logger {
  const moduleColor = getModuleColor(module)
  const moduleStyle = `color: ${moduleColor}; font-weight: bold;`

  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, error?: unknown) => {
    const tag = `%c[${module}]%c ${LEVEL_ICONS[level]} ${message}`
    const levelStyle = LEVEL_STYLES[level]
    const timestamp = formatTimestamp()

    // 1. 控制台输出
    if (level === 'error') {
      if (data && Object.keys(data).length > 0) {
        console.error(tag, moduleStyle, levelStyle, data)
      } else {
        console.error(tag, moduleStyle, levelStyle)
      }
      if (error) {
        console.error(error)
      }
    } else if (level === 'warn') {
      console.warn(tag, moduleStyle, levelStyle, data || '')
    } else {
      const consoleFn = level === 'success' ? console.info : console.log
      if (data && Object.keys(data).length > 0) {
        consoleFn(tag, moduleStyle, levelStyle, data)
      } else {
        consoleFn(tag, moduleStyle, levelStyle)
      }
    }

    // 2. 持久化到服务端
    const entry: LogEntry = {
      timestamp,
      level,
      module,
      message,
    }
    if (data && Object.keys(data).length > 0) {
      entry.data = data
    }
    if (error) {
      entry.error = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error)
    }
    persistLog(entry)
  }

  return {
    info: (message, data) => log('info', message, data),
    success: (message, data) => log('success', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data, error) => log('error', message, data, error),
    group: (label, fn) => {
      console.group(`%c[${module}]%c ${label}`, moduleStyle, 'font-weight: bold;')
      fn()
      console.groupEnd()
    },
  }
}
