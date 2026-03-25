import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './lib/runtime'
import { authRouter } from './routes/auth'
import { householdRouter } from './routes/household'
import { stateRouter } from './routes/state'
import { requireAuth } from './lib/auth'
import { ensureDatabaseReady } from './lib/bootstrap'

const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.use(
  '*',
  async (c, next) => {
    await ensureDatabaseReady(c.env.DB)
    await next()
  },
)

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const frontendUrl = c.env.FRONTEND_URL?.trim()
      if (frontendUrl) return frontendUrl
      return origin ?? '*'
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
