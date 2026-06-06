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

  async run(): Promise<{ success: boolean; changes?: number }> {
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

  async execute(sql: string, params: unknown[]): Promise<{ success: boolean; changes?: number }> {
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

    if (sql.startsWith('INSERT INTO rate_limits')) {
      const [key, attempts, windowStart] = params
      const existing = this.rateLimits.get(String(key))
      if (existing) {
        existing.attempts = Number(existing.attempts) + 1
        return { success: true, changes: 1 }
      }

      this.rateLimits.set(String(key), {
        key,
        attempts,
        window_start: windowStart,
      })
      return { success: true, changes: 1 }
    }

    if (sql.startsWith('INSERT INTO users')) {
      const [id, email, createdAt] = params
      this.users.set(String(id), { id, email, created_at: createdAt })
      return { success: true, changes: 1 }
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

    if (sql.startsWith('UPDATE verification_tokens SET consumed_at')) {
      const [consumedAt, token] = params
      const row = this.verificationTokens.get(String(token))
      if (row) {
        row.consumed_at = consumedAt
        return { success: true, changes: 1 }
      }
      return { success: true, changes: 0 }
    }

    if (sql.startsWith('INSERT INTO sessions')) {
      const [token, userId, expiresAt, createdAt] = params
      this.sessions.set(String(token), {
        token,
        user_id: userId,
        expires_at: expiresAt,
        created_at: createdAt,
      })
      return { success: true, changes: 1 }
    }

    return { success: true, changes: 0 }
  }
}

function makeEnv(db: MemoryDatabase, allowedEmails?: string, resendApiKey?: string): Env {
  return {
    DB: db,
    ALLOWED_EMAILS: allowedEmails,
    RESEND_API_KEY: resendApiKey,
    FROM_EMAIL: 'noreply@example.com',
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sign-in', () => {
  it('returns a structured error when mail delivery fails', async () => {
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

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: 'mail_delivery_failed',
      message: 'Kunne ikke sende login-linket lige nu. Prøv igen om lidt.',
    })
    expect(db.users.size).toBe(1)
    expect(db.verificationTokens.size).toBe(2)
    expect(db.rateLimits.size).toBe(1)
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
