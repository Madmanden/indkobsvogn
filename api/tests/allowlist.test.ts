import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { isEmailAllowed } from '../src/lib/allowlist'
import { requireAuth, type AuthedContextVariables } from '../src/lib/auth'
import { authRouter } from '../src/routes/auth'
import type { DatabaseLike, PreparedStatementLike, Env } from '../src/lib/runtime'

type TableRow = Record<string, unknown>

class MemoryStatement implements PreparedStatementLike {
  private params: unknown[] = []

  constructor(
    private readonly db: MemoryDatabase,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): PreparedStatementLike {
    this.params = values
    return this
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const rows = await this.all<T>()
    return rows.results[0] ?? null
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.db.query<T>(this.sql, this.params) }
  }

  async run(): Promise<{ success: boolean; changes?: number }> {
    return this.db.execute(this.sql, this.params)
  }
}

class MemoryDatabase implements DatabaseLike {
  users = new Map<string, TableRow>()
  sessions = new Map<string, TableRow>()
  verificationTokens = new Map<string, TableRow>()

  prepare(sql: string): PreparedStatementLike {
    return new MemoryStatement(this, sql)
  }

  query<T>(sql: string, params: unknown[]): T[] {
    if (sql.includes('FROM users WHERE email = ?')) {
      const email = String(params[0])
      const row = [...this.users.values()].find((entry) => entry.email === email)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM users WHERE id = ?')) {
      const id = String(params[0])
      const row = this.users.get(id)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM sessions WHERE token = ?')) {
      const token = String(params[0])
      const row = this.sessions.get(token)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM verification_tokens WHERE token = ?')) {
      const token = String(params[0])
      const row = this.verificationTokens.get(token)
      return row ? ([row] as T[]) : []
    }

    return []
  }

  async execute(sql: string, params: unknown[]): Promise<{ success: boolean; changes?: number }> {
    if (sql.startsWith('INSERT INTO users')) {
      const [id, email, createdAt] = params
      this.users.set(String(id), { id, email, created_at: createdAt })
      return { success: true, changes: 1 }
    }

    if (sql.startsWith('INSERT INTO sessions')) {
      const [token, userId, expiresAt, createdAt] = params
      this.sessions.set(String(token), { token, user_id: userId, expires_at: expiresAt, created_at: createdAt })
      return { success: true, changes: 1 }
    }

    if (sql.startsWith('DELETE FROM sessions')) {
      const [token] = params
      const changed = this.sessions.delete(String(token)) ? 1 : 0
      return { success: true, changes: changed }
    }

    if (sql.startsWith('INSERT INTO verification_tokens')) {
      const [token, email, expiresAt, createdAt] = params
      this.verificationTokens.set(String(token), {
        token,
        email,
        expires_at: expiresAt,
        created_at: createdAt,
        consumed_at: null,
      })
      return { success: true, changes: 1 }
    }

    if (sql.startsWith('UPDATE verification_tokens SET consumed_at = ?')) {
      const [consumedAt, token] = params
      const row = this.verificationTokens.get(String(token))
      if (!row) return { success: true, changes: 0 }
      row.consumed_at = consumedAt
      return { success: true, changes: 1 }
    }

    return { success: true, changes: 0 }
  }
}

function makeEnv(db: MemoryDatabase, allowedEmails?: string): Env {
  return {
    DB: db,
    ALLOWED_EMAILS: allowedEmails,
  }
}

function makeProtectedApp(db: MemoryDatabase, allowedEmails?: string) {
  const app = new Hono<{ Bindings: Env; Variables: AuthedContextVariables }>()
  app.use('/private', requireAuth)
  app.get('/private', (c) => c.json({ email: c.get('user').email }))
  return { app, env: makeEnv(db, allowedEmails) }
}

describe('email allowlist', () => {
  it('treats an empty allowlist as open', () => {
    expect(isEmailAllowed('alice@example.com')).toBe(true)
  })

  it('blocks sign-in for emails that are not on the allowlist', async () => {
    const db = new MemoryDatabase()
    const response = await authRouter.request(
      '/sign-in',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'blocked@example.com' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'email_not_allowed' })
    expect(db.users.size).toBe(0)
    expect(db.verificationTokens.size).toBe(0)
  })

  it('allows whitelisted sessions and rejects stale sessions after a whitelist change', async () => {
    const db = new MemoryDatabase()
    const { app, env } = makeProtectedApp(db, 'allowed@example.com')

    const createdAt = Date.now()
    db.users.set('user_1', { id: 'user_1', email: 'allowed@example.com', created_at: createdAt })
    db.sessions.set('session_1', {
      token: 'session_1',
      user_id: 'user_1',
      expires_at: createdAt + 1000 * 60,
      created_at: createdAt,
    })

    const allowedResponse = await app.request('/private', {
      headers: { cookie: 'indkobsvogn_session=session_1' },
    }, env)
    expect(allowedResponse.status).toBe(200)
    await expect(allowedResponse.json()).resolves.toEqual({ email: 'allowed@example.com' })

    const blockedApp = makeProtectedApp(db, 'someone-else@example.com')
    const blockedResponse = await blockedApp.app.request('/private', {
      headers: { cookie: 'indkobsvogn_session=session_1' },
    }, blockedApp.env)

    expect(blockedResponse.status).toBe(403)
    await expect(blockedResponse.json()).resolves.toMatchObject({ error: 'email_not_allowed' })
    expect(db.sessions.has('session_1')).toBe(false)
  })
})

