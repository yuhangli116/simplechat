import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { generateTextServer, parseRequestBody, sendJson, summarizeContextServer } from './server/aiProxy.js'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  // Also expose VITE_ prefixed vars without the prefix for server-side access
  Object.keys(env).forEach(key => {
    if (key.startsWith('VITE_')) {
      const withoutPrefix = key.replace('VITE_', '')
      // Always assign from VITE_ prefixed vars to ensure they're available server-side
      process.env[withoutPrefix] = env[key]
    }
  })

  return {
    plugins: [
      react(),
      {
        name: 'local-ai-proxy',
        configureServer(server) {
          server.middlewares.use('/api/ai/generate', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }

            try {
              const body = await parseRequestBody(req)
              const result = await generateTextServer(body)
              sendJson(res, 200, result)
            } catch (error) {
              sendJson(res, 500, {
                error: error instanceof Error ? error.message : 'AI request failed',
              })
            }
          })

          server.middlewares.use('/api/ai/summarize', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }

            try {
              const body = await parseRequestBody(req)
              const result = await summarizeContextServer(body)
              sendJson(res, 200, result)
            } catch (error) {
              sendJson(res, 500, {
                error: error instanceof Error ? error.message : 'AI summarize failed',
              })
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
  }
})
