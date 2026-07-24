import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only: serve the Vercel serverless functions in `api/` during `npm run dev`.
// In production Vercel runs these natively; Vite's dev server does not, so without
// this the 10-yr Treasury badge (which calls /api/treasury) can't be tested locally.
// We adapt Node's http req/res to the Express-like (res.status/res.json) shape the
// handlers expect, and re-import the handler each request so edits hot-apply.
function devApi() {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith('/api/')) return next()
        const name = url.replace('/api/', '').replace(/\/$/, '')
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          const handler = mod.default
          // Minimal Express-like shim over the raw Node response.
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
            return res
          }
          await handler(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'dev api error', detail: String((e && e.message) || e) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
