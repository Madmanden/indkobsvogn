import { describe, expect, it, vi, afterEach } from 'vitest'
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

  async run(): Promise<{ success: boolean; changes?: number; meta?: { changes?: number } }> {
    return this.db.execute(this.sql, this.params)
  }
}

class MemoryDatabase implements DatabaseLike {
  users = new Map<string, TableRow>()
  verificationTokens = new Map<string, TableRow>()
  rateLimits = new Map<string, TableRow>()
  sessions = new Map<string, TableRow>()

  prepare(sql: string): PreparedStatementLike {
    return new MemoryStatement(this, sql)
  }

  query<T>(sql: string, params: unknown[]): T[] {
    if (sql.includes('FROM users WHERE email = ?')) {
      const email = String(params[0])
      const row = [...this.users.values()].find((entry) => entry.email === email)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM rate_limits WHERE key = ?')) {
      const key = String(params[0])
      const row = this.rateLimits.get(key)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM verification_tokens WHERE token = ?')) {
      const token = String(params[0])
      const row = this.verificationTokens.get(token)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM users WHERE id = ?')) {
      const id = String(params[0])
      const row = this.users.get(id)
      return row ? ([row] as T[]) : []
    }

    return []
  }

  async execute(sql: string, params: unknown[]): Promise<{ success: boolean; changes?: number; meta?: { changes?: number } }> {
    if (sql.startsWith('DELETE FROM rate_limits')) {
      const [windowStart] = params
      let changes = 0
      for (const [key, row] of this.rateLimits.entries()) {
        if (Number(row.window_start) < Number(windowStart)) {
          this.rateLimits.delete(key)
          changes += 1
        }
      }
      return { success: true, changes }
    }

    if (sql.startsWith('DELETE FROM verification_tokens WHERE email = ?')) {
      const [email] = params
      let changes = 0
      for (const [key, row] of this.verificationTokens.entries()) {
        if (String(row.email) === String(email)) {
          this.verificationTokens.delete(key)
          changes += 1
        }
      }
      return { success: true, changes }
    }

    if (sql.startsWith('DELETE FROM verification_tokens') && sql.includes('expires_at')) {
      const [now] = params
      let changes = 0
      for (const [key, row] of this.verificationTokens.entries()) {
        if (Number(row.expires_at) < Number(now) || row.consumed_at !== null) {
          this.verificationTokens.delete(key)
          changes += 1
        }
      }
      return { success: true, changes }
    }

    if (sql.startsWith('DELETE FROM sessions')) {
      const [param] = params
      if (sql.includes('expires_at')) {
        let changes = 0
        for (const [key, row] of this.sessions.entries()) {
          if (Number(row.expires_at) < Number(param)) {
            this.sessions.delete(key)
            changes += 1
          }
        }
        return { success: true, changes }
      }
      const changed = this.sessions.delete(String(param)) ? 1 : 0
      return { success: true, meta: { changes: changed } }
    }

    if (sql.startsWith('INSERT INTO rate_limits')) {
      const [key, attempts, windowStart] = params
      const existing = this.rateLimits.get(String(key))
      if (existing) {
        existing.attempts = Number(existing.attempts) + 1
        return { success: true, meta: { changes: 1 } }
      }

      this.rateLimits.set(String(key), {
        key,
        attempts,
        window_start: windowStart,
      })
      return { success: true, meta: { changes: 1 } }
    }

    if (sql.startsWith('INSERT INTO users')) {
      const [id, email, createdAt] = params
      this.users.set(String(id), { id, email, created_at: createdAt })
      return { success: true, meta: { changes: 1 } }
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
      return { success: true, meta: { changes: 1 } }
    }

    if (sql.startsWith('UPDATE verification_tokens SET consumed_at')) {
      const [consumedAt, token, nowOrExpiry] = params
      const row = this.verificationTokens.get(String(token))
      if (!row) return { success: true, meta: { changes: 0 } }
      if (row.consumed_at !== null) return { success: true, meta: { changes: 0 } }
      if (sql.includes('expires_at > ?') && Number(row.expires_at) <= Number(nowOrExpiry)) {
        return { success: true, meta: { changes: 0 } }
      }
      row.consumed_at = consumedAt
      return { success: true, meta: { changes: 1 } }
    }

    if (sql.startsWith('INSERT INTO sessions')) {
      const [token, userId, expiresAt, createdAt] = params
      this.sessions.set(String(token), {
        token,
        user_id: userId,
        expires_at: expiresAt,
        created_at: createdAt,
      })
      return { success: true, meta: { changes: 1 } }
    }

    return { success: true, meta: { changes: 0 } }
  }
}

function makeEnv(db: MemoryDatabase, allowedEmails?: string, resendApiKey?: string, env: Record<string, string | undefined> = {}): Env {
  return {
    DB: db,
    ALLOWED_EMAILS: allowedEmails,
    RESEND_API_KEY: resendApiKey,
    FROM_EMAIL: 'noreply@example.com',
    FRONTEND_URL: 'http://localhost:5173',
    ALLOW_LOCAL_SIGNIN: '1',
    ...env,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sign-in', () => {
  it('returns a fallback code when mail delivery fails', async () => {
    const db = new MemoryDatabase()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }))

    const response = await authRouter.request(
      '/sign-in',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com' }),
      },
      makeEnv(db, 'allowed@example.com', 'test-resend-key'),
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      ok: true,
      deliveryStatus: 'fallback',
    })
    expect(payload.backupCode).toMatch(/^\d{6}$/)
    expect(payload.verificationUrl).toBeUndefined()
    expect(db.users.size).toBe(1)
    expect(db.verificationTokens.size).toBe(2)
    expect(db.rateLimits.size).toBe(1)

    const verifyResponse = await authRouter.request(
      '/sign-in/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com', code: payload.backupCode }),
      },
      makeEnv(db, 'allowed@example.com', 'test-resend-key'),
    )

    expect(verifyResponse.status).toBe(200)
    await expect(verifyResponse.json()).resolves.toMatchObject({ ok: true })
    expect(db.sessions.size).toBe(1)
  })

  it('fails closed when email delivery is not configured and local sign-in is disabled', async () => {
    const db = new MemoryDatabase()

    const response = await authRouter.request(
      '/sign-in',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com' }),
      },
      makeEnv(db, 'allowed@example.com', undefined, { ALLOW_LOCAL_SIGNIN: undefined }),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: 'sign_in_failed' })
    expect(db.verificationTokens.size).toBe(0)
  })

  it('invalidates previously issued tokens on a new sign-in request', async () => {
    const db = new MemoryDatabase()

    await authRouter.request(
      '/sign-in',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )
    expect(db.verificationTokens.size).toBe(2)

    await authRouter.request(
      '/sign-in',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(db.verificationTokens.size).toBe(2)
  })
})

function seedCodeToken(db: MemoryDatabase, email: string, code: string, expiresAt: number): void {
  const token = `code:${email}:${code}`
  db.verificationTokens.set(token, {
    token,
    email,
    expires_at: expiresAt,
    created_at: Date.now(),
    consumed_at: null,
  })
}

describe('verify-code', () => {
  it('verifies a valid code, consumes the token, and sets a session cookie', async () => {
    const db = new MemoryDatabase()
    const expiresAt = Date.now() + 1000 * 60 * 15
    seedCodeToken(db, 'allowed@example.com', '123456', expiresAt)

    const response = await authRouter.request(
      '/sign-in/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com', code: '123456' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
    const setCookie = response.headers.get('Set-Cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('indkobsvogn_session=')
    expect(db.sessions.size).toBe(1)
    const consumed = db.verificationTokens.get('code:allowed@example.com:123456')
    expect(consumed?.consumed_at).not.toBeNull()
  })

  it('rejects an unknown code', async () => {
    const db = new MemoryDatabase()

    const response = await authRouter.request(
      '/sign-in/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com', code: '999999' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_code' })
    expect(db.sessions.size).toBe(0)
  })

  it('rejects an expired code', async () => {
    const db = new MemoryDatabase()
    seedCodeToken(db, 'allowed@example.com', '123456', Date.now() - 1000)

    const response = await authRouter.request(
      '/sign-in/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com', code: '123456' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_code' })
    expect(db.sessions.size).toBe(0)
  })

  it('rejects malformed code input', async () => {
    const db = new MemoryDatabase()

    const response = await authRouter.request(
      '/sign-in/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com', code: '12a456' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_code' })
  })

  it('rate limits after too many attempts', async () => {
    const db = new MemoryDatabase()

    for (let i = 0; i < 5; i += 1) {
      await authRouter.request(
        '/sign-in/verify-code',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'allowed@example.com', code: '000000' }),
        },
        makeEnv(db, 'allowed@example.com'),
      )
    }

    const response = await authRouter.request(
      '/sign-in/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com', code: '000000' }),
      },
      makeEnv(db, 'allowed@example.com'),
    )

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({ error: 'too_many_requests' })
    expect(response.headers.get('Retry-After')).toBeTruthy()
  })
})