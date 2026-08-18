import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './lib/runtime'
import { authRouter } from './routes/auth'
import { householdRouter } from './routes/household'
import { stateRouter } from './routes/state'
import { requireAuth } from './lib/auth'
import { ensureDatabaseReady } from './lib/bootstrap'

const app = new Hono<{ Bindings: Env }>().basePath('/api')

const RECOMMENDED_ENV_VARS: ReadonlyArray<keyof Env> = [
  'RESEND_API_KEY',
  'FROM_EMAIL',
  'ALLOWED_EMAILS',
  'FRONTEND_URL',
]

let envWarningIssued = false

app.use(
  '*',
  async (c, next) => {
    await ensureDatabaseReady(c.env.DB)

    if (!envWarningIssued) {
      envWarningIssued = true
      const missing = RECOMMENDED_ENV_VARS.filter((name) => {
        const value = c.env[name]
        return value === undefined || value === null || String(value).trim() === ''
      })

      if (missing.length > 0 && !isLocalSignInAllowed(c.env)) {
        console.warn(`Missing recommended env vars: ${missing.join(', ')}`)
      }
    }

    await next()
  },
)

function isLocalSignInAllowed(env: Env): boolean {
  return env.ALLOW_LOCAL_SIGNIN === '1' || env.ALLOW_LOCAL_SIGNIN === 'true'
}

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const frontendUrl = c.env.FRONTEND_URL?.trim()
      if (frontendUrl) return frontendUrl

      // No FRONTEND_URL configured: only allow same-origin requests
      if (!origin) return undefined

      try {
        const requestOrigin = new URL(c.req.url).origin
        return origin === requestOrigin ? origin : undefined
      } catch {
        return undefined
      }
    },
    credentials: true,
  }),
)

// Security headers middleware
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
})

app.get('/health', (c) => c.json({ ok: true }))

app.route('/auth', authRouter)

app.use('/state', requireAuth)
app.use('/state/*', requireAuth)
app.use('/household', requireAuth)
app.use('/household/*', requireAuth)

app.route('/state', stateRouter)
app.route('/household', householdRouter)

export default app
