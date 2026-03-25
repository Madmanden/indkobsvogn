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
    expect(db.verificationTokens.size).toBe(1)
    expect(db.rateLimits.size).toBe(1)
  })
})
