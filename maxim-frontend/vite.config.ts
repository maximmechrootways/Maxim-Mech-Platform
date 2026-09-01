import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Local Node API — must match maxim-backend listen port (default 3000). */
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000'

const BACKEND_PATH_PREFIXES = [
  '/webhooks',
  '/uploads',
  '/auth',
  '/documents',
  '/api',
  '/jobs',
  '/sites',
  '/subcontractors',
  '/offline-subcontractor-forms',
  '/equipment',
  '/users',
  '/templates',
  '/submissions',
  '/signable-submissions',
  '/daily-forms',
  '/daily-hazard-analysis',
  '/dha-presets',
  '/pdf-templates',
  '/pdf-submissions',
  '/toolbox-topics',
  '/signing',
  '/injury-reports',
  '/certificates',
  '/training-course-types',
  '/incidents',
  '/near-misses',
  '/hazards',
  '/observations',
  '/capa',
  '/safety-alerts',
  '/inspections',
  '/compliance-calendar',
  '/audit-log',
  '/quality-findings',
  '/incoming-invoices',
  '/outgoing-invoices',
  '/hr-todo',
  '/google-calendar',
  '/notifications',
  '/composio',
  '/hazard-review',
  '/feedback',
  '/time-off',
  '/employee-time-tracking',
  '/form-qr-codes',
  '/qr',
  '/permissions',
  '/invite',
  '/employee-documents',
  '/estimation-project-files',
  '/inspection-attachments',
  '/local-documents',
  '/frank',
  '/form-assignments',
  '/admin',
  '/health',
] as const

export default defineConfig(({ mode }) => {
  if (mode === 'production' && !process.env.VITE_API_URL) {
    console.warn(
      '\n[Vite] VITE_API_URL is not set for this production build. The bundle will default the API base to http://localhost:3000 and uploads will fail when deployed.\n' +
        'Set VITE_API_URL before build (e.g. https://your-app.vercel.app/api if you proxy /api to the backend on Vercel).\n'
    )
  }
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      proxy: Object.fromEntries(
        BACKEND_PATH_PREFIXES.map((prefix) => [
          prefix,
          {
            target: API_TARGET,
            changeOrigin: true,
            /** Browser refresh on SPA routes (e.g. /incoming-invoices) must serve index.html, not the API. */
            bypass(req) {
              const accept = req.headers.accept ?? ''
              if (req.method === 'GET' && accept.includes('text/html')) {
                return '/index.html'
              }
            },
          },
        ])
      ),
    },
  }
})
