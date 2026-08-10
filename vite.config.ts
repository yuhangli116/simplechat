import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { generateTextServer, getRequestContext, parseRequestBody, sendJson, sendNdjson, streamGenerateTextServer, summarizeContextServer } from './server/aiProxy.js'
import { createServerLogger, persistBatchLogs, initLogger } from './server/logger.js'
import {
  RequestGuardError,
  applyAiRequestGuard,
  applyLogRequestGuard,
  parseJwtSubject,
  sanitizeLogBatch,
  sendGuardError,
} from './server/security/requestGuards.js'
import { checkSecurityControls, sendSecurityBlocked } from './server/security/securityControls.js'
import { createPaymentSystem } from './server/payments/index.js'

const log = createServerLogger('ViteDev')
const sharedMaintenanceStatePath = path.resolve(process.cwd(), '..', '.codex', 'site-maintenance-state.json')

const readSharedMaintenanceState = (): any => {
  try {
    if (!existsSync(sharedMaintenanceStatePath)) return null
    const raw = JSON.parse(readFileSync(sharedMaintenanceStatePath, 'utf8')) as Record<string, any>
    if (!raw || typeof raw !== 'object') return null
    const next = raw
    const plannedStartAt = typeof next.planned_start_at === 'string' ? next.planned_start_at : null
    const plannedEndAt = typeof next.planned_end_at === 'string' ? next.planned_end_at : null
    const announceAt = typeof next.announce_at === 'string' ? next.announce_at : null
    const lockAt = typeof next.lock_at === 'string' ? next.lock_at : null
    const noticeText = typeof next.notice_text === 'string' ? next.notice_text : undefined
    const plannedStartMs = plannedStartAt ? Date.parse(plannedStartAt) : NaN
    const announceLeadMinutes = Number(next.announce_lead_minutes ?? 2880) || 2880
    const lockLeadMinutes = Number(next.lock_lead_minutes ?? 30) || 30
    const serverNow = new Date().toISOString()
    const nowMs = Date.parse(serverNow)
    const plannedEndMs = plannedEndAt ? Date.parse(plannedEndAt) : NaN
    const announceMs = announceAt ? Date.parse(announceAt) : NaN
    const lockMs = lockAt ? Date.parse(lockAt) : NaN

    let phase = next.phase === 'announced' || next.phase === 'locked' ? next.phase : 'normal'
    if (plannedStartAt && plannedEndAt && Number.isFinite(nowMs) && Number.isFinite(plannedEndMs)) {
      if (nowMs >= plannedEndMs) phase = 'normal'
      else if (Number.isFinite(lockMs) && nowMs >= lockMs) phase = 'locked'
      else if (Number.isFinite(announceMs) && nowMs >= announceMs) phase = 'announced'
      else phase = 'normal'
    }

    return {
      ...next,
      phase,
      announce_at: announceAt || (Number.isFinite(plannedStartMs) ? new Date(plannedStartMs - announceLeadMinutes * 60_000).toISOString() : null),
      lock_at: lockAt || (Number.isFinite(plannedStartMs) ? new Date(plannedStartMs - lockLeadMinutes * 60_000).toISOString() : null),
      notice_text: noticeText ?? next.notice_text,
      server_now: serverNow,
    }
  } catch {
    return null
  }
}

const writeSharedMaintenanceState = (state: unknown) => {
  const dir = path.dirname(sharedMaintenanceStatePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(sharedMaintenanceStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  const publicSupabaseEnv = {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''),
  }

  Object.keys(env).forEach(key => {
    if (key.startsWith('VITE_')) {
      const withoutPrefix = key.replace('VITE_', '')
      process.env[withoutPrefix] = env[key]
    }
  })

  // 初始化日志系统（开发模式）
  initLogger()

  const securitySupabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
    : null
  const paymentSystem = createPaymentSystem({
    env,
    supabase: securitySupabase,
    logger: createServerLogger('PaymentsDev'),
  })
  const paymentCallbackApp = express()
  paymentCallbackApp.use(paymentSystem.callbackRouter)
  const paymentUserApp = express()
  paymentUserApp.use(paymentSystem.userRouter)

  return {
    define: publicSupabaseEnv,
    server: {
      port: Number(env.PORT || 3000),
      strictPort: true,
      host: '127.0.0.1',
    },
    plugins: [
      react(),
      {
        name: 'local-ai-proxy',
        configureServer(server) {
          // 支付宝回调在维护中也必须可达；非回调路径会继续进入后续中间件。
          server.middlewares.use('/api/payments', paymentCallbackApp)
          server.middlewares.use('/api', async (req, res, next) => {
            if (req.url?.startsWith('/health') || req.url?.startsWith('/site-maintenance-state')) {
              next()
              return
            }

            const maintenanceState = readSharedMaintenanceState()
            if (maintenanceState?.phase === 'locked' && !req.url?.startsWith('/log')) {
              log.warn('Dev API request rejected by maintenance lock', {
                url: req.url,
                method: req.method,
                phase: maintenanceState.phase,
              })
              sendJson(res, 503, {
                error: maintenanceState.notice_text || '系统正在维护升级，当前暂不对外开放，请稍后再试。',
                code: 'MAINTENANCE_LOCKED',
                phase: 'locked',
                planned_start_at: maintenanceState.planned_start_at,
                planned_end_at: maintenanceState.planned_end_at,
                server_now: new Date().toISOString(),
              })
              return
            }

            if (!securitySupabase) {
              next()
              return
            }

            const requestContext = getRequestContext(req)
            const userId = parseJwtSubject(requestContext.accessToken || '')
            const security = await checkSecurityControls({
              supabase: securitySupabase,
              userId,
              ip: requestContext.ip,
              kind: 'vite_dev_middleware',
            })

            if (security.blocked) {
              log.warn('Dev API request rejected by security middleware', {
                url: req.url,
                method: req.method,
                userId,
                ip: requestContext.ip,
                userStatus: security.userStatus,
                ipStatus: security.ipStatus,
              })
              sendSecurityBlocked(res, security)
              return
            }

            next()
          })

          server.middlewares.use('/api/payments', paymentUserApp)

          server.middlewares.use('/api/site-maintenance-state', (req, res) => {
            if (req.method !== 'GET') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }

            const state = readSharedMaintenanceState()
            if (!state) {
              sendJson(res, 200, {
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
              })
              return
            }

            sendJson(res, 200, state)
          })

          server.middlewares.use('/api/health', (req, res) => {
            if (req.method !== 'GET') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            log.info('Health check (dev)')
            sendJson(res, 200, { ok: true, logDir: 'log' })
          })

          // 日志接收端点
          server.middlewares.use('/api/log', (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            parseRequestBody(req).then((body) => {
              const requestContext = getRequestContext(req)
              applyLogRequestGuard({ body: body || {}, req, requestContext })
              const logs = sanitizeLogBatch(body?.logs || [])
              if (logs.length > 0) {
                persistBatchLogs(logs)
              }
              sendJson(res, 200, { ok: true })
            }).catch((error) => {
              if (error instanceof RequestGuardError) {
                sendGuardError(res, error, sendJson)
                return
              }
              sendJson(res, 500, { error: 'Log persist failed' })
            })
          })

          server.middlewares.use('/api/ai/generate', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            let releaseGuard = () => {}
            try {
              const body = await parseRequestBody(req)
              const requestContext = getRequestContext(req)
              releaseGuard = applyAiRequestGuard({
                endpoint: 'generate',
                body,
                requestContext,
                req,
                res,
              })
              log.info('AI generate request (dev)', { model: body.model, ip: requestContext.ip })
              const result = await generateTextServer(body, requestContext)
              if (result.error) {
                log.warn('AI generate returned error (dev)', { model: body.model, error: result.error?.slice(0, 200) })
              } else {
                log.info('AI generate success (dev)', { model: body.model, totalCost: result.usage?.total_cost })
              }
              sendJson(res, 200, result)
            } catch (error) {
              if (error instanceof RequestGuardError) {
                sendGuardError(res, error, sendJson)
                return
              }
              log.error('AI generate unhandled error (dev)', {}, error)
              sendJson(res, 500, { error: error instanceof Error ? error.message : 'AI request failed' })
            } finally {
              releaseGuard()
            }
          })
          server.middlewares.use('/api/ai/generate-stream', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            let releaseGuard = () => {}
            try {
              const body = await parseRequestBody(req)
              const requestContext = getRequestContext(req)
              releaseGuard = applyAiRequestGuard({
                endpoint: 'generateStream',
                body,
                requestContext,
                req,
                res,
              })
              log.info('AI generate stream request (dev)', {
                traceId: body.traceId,
                model: body.model,
                ip: requestContext.ip,
                workId: body.workId,
                chapterId: body.chapterId,
                deferChapterSave: body.deferChapterSave,
              })
              await sendNdjson(res, async (write) => {
                const result = await streamGenerateTextServer(body, requestContext, {
                  emit: write,
                })
                if (result.error) {
                  log.warn('AI generate stream returned error (dev)', { traceId: body.traceId, model: body.model, error: result.error?.slice(0, 200) })
                  await write({ type: 'error', error: result.error, billing: result.billing })
                  return
                }
                log.info('AI generate stream success (dev)', { traceId: body.traceId, model: body.model, totalCost: result.usage?.total_cost })
                await write({ type: 'done', ...result })
              })
            } catch (error) {
              if (error instanceof RequestGuardError) {
                sendGuardError(res, error, sendJson)
                return
              }
              log.error('AI generate stream unhandled error (dev)', {}, error)
              sendJson(res, 500, { error: error instanceof Error ? error.message : 'AI request failed' })
            } finally {
              releaseGuard()
            }
          })
          server.middlewares.use('/api/ai/summarize', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            let releaseGuard = () => {}
            try {
              const body = await parseRequestBody(req)
              const requestContext = getRequestContext(req)
              releaseGuard = applyAiRequestGuard({
                endpoint: 'summarize',
                body,
                requestContext,
                req,
                res,
              })
              log.info('AI summarize request (dev)', {
                traceId: body.traceId,
                model: body.model,
                billingGroupId: body.billingGroupId,
                ip: requestContext.ip,
              })
              const result = await summarizeContextServer(body, requestContext)
              if (result.error) {
                log.warn('AI summarize returned error (dev)', {
                  traceId: body.traceId,
                  model: body.model,
                  billingGroupId: body.billingGroupId,
                  error: result.error?.slice(0, 200),
                })
              } else {
                log.info('AI summarize success (dev)', {
                  traceId: body.traceId,
                  model: body.model,
                  billingGroupId: body.billingGroupId,
                  totalCost: result.usage?.total_cost,
                })
              }
              sendJson(res, 200, result)
            } catch (error) {
              if (error instanceof RequestGuardError) {
                sendGuardError(res, error, sendJson)
                return
              }
              log.error('AI summarize unhandled error (dev)', {}, error)
              sendJson(res, 500, { error: error instanceof Error ? error.message : 'AI summarize failed' })
            } finally {
              releaseGuard()
            }
          })

          server.middlewares.use('/__maintenance-sync', (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }

            parseRequestBody(req).then((body) => {
              writeSharedMaintenanceState(body || {})
              sendJson(res, 200, { ok: true })
            }).catch((error) => {
              sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to sync maintenance state' })
            })
          })

          server.httpServer?.once('close', () => {
            paymentSystem.close().catch(() => {})
          })
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'flow-vendor': ['reactflow', 'dagre'],
            'ui-vendor': ['lucide-react', 'zustand'],
            'supabase': ['@supabase/supabase-js']
          }
        }
      }
    }
  }
})
