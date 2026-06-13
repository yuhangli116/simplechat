import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { generateTextServer, getRequestContext, parseRequestBody, sendJson, summarizeContextServer } from './server/aiProxy.js'
import { createServerLogger, persistBatchLogs, initLogger } from './server/logger.js'

const log = createServerLogger('ViteDev')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  Object.keys(env).forEach(key => {
    if (key.startsWith('VITE_')) {
      const withoutPrefix = key.replace('VITE_', '')
      process.env[withoutPrefix] = env[key]
    }
  })

  // 初始化日志系统（开发模式）
  initLogger()

  return {
    plugins: [
      react(),
      {
        name: 'local-ai-proxy',
        configureServer(server) {
          // 日志接收端点
          server.middlewares.use('/api/log', (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            parseRequestBody(req).then((body) => {
              const { logs } = body || {}
              if (Array.isArray(logs) && logs.length > 0) {
                persistBatchLogs(logs)
              }
              sendJson(res, 200, { ok: true })
            }).catch(() => {
              sendJson(res, 500, { error: 'Log persist failed' })
            })
          })

          server.middlewares.use('/api/ai/generate', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            try {
              const body = await parseRequestBody(req)
              const requestContext = getRequestContext(req)
              log.info('AI generate request (dev)', { model: body.model, ip: requestContext.ip })
              const result = await generateTextServer(body, requestContext)
              if (result.error) {
                log.warn('AI generate returned error (dev)', { model: body.model, error: result.error?.slice(0, 200) })
              } else {
                log.info('AI generate success (dev)', { model: body.model, totalCost: result.usage?.total_cost })
              }
              sendJson(res, 200, result)
            } catch (error) {
              log.error('AI generate unhandled error (dev)', {}, error)
              sendJson(res, 500, { error: error instanceof Error ? error.message : 'AI request failed' })
            }
          })
          server.middlewares.use('/api/ai/summarize', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            try {
              const body = await parseRequestBody(req)
              const requestContext = getRequestContext(req)
              log.info('AI summarize request (dev)', { model: body.model, ip: requestContext.ip })
              const result = await summarizeContextServer(body, requestContext)
              if (result.error) {
                log.warn('AI summarize returned error (dev)', { model: body.model, error: result.error?.slice(0, 200) })
              } else {
                log.info('AI summarize success (dev)', { model: body.model, totalCost: result.usage?.total_cost })
              }
              sendJson(res, 200, result)
            } catch (error) {
              log.error('AI summarize unhandled error (dev)', {}, error)
              sendJson(res, 500, { error: error instanceof Error ? error.message : 'AI summarize failed' })
            }
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
