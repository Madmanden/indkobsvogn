import { describe, expect, it } from 'vitest'
import { Repository } from '../src/lib/repository'
import type { DatabaseLike, PreparedStatementLike } from '../src/lib/runtime'

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
  households = new Map<string, TableRow>()
  members: TableRow[] = []

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

    if (sql.includes('FROM members WHERE email = ?')) {
      const email = String(params[0])
      const row = this.members.find((entry) => entry.email === email)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM members WHERE household_id = ?')) {
      const householdId = String(params[0])
      return this.members
        .filter((entry) => entry.household_id === householdId)
        .sort((a, b) => Number(a.created_at) - Number(b.created_at)) as T[]
    }

    if (sql.includes('FROM households WHERE id = ?')) {
      const id = String(params[0])
      const row = this.households.get(id)
      return row ? ([row] as T[]) : []
    }

    if (sql.includes('FROM households WHERE household_code = ?')) {
      const code = String(params[0])
      const row = [...this.households.values()].find((entry) => entry.household_code === code)
      return row ? ([row] as T[]) : []
    }

    return []
  }

  async execute(sql: string, params: unknown[]): Promise<{ success: boolean; changes?: number }> {
    if (sql.startsWith('INSERT INTO users')) {
      const [id, email, createdAt] = params
      if ([...this.users.values()].some((entry) => entry.email === email)) {
        throw new Error('unique constraint failed: users.email')
      }
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

    if (sql.startsWith('INSERT INTO households')) {
      const [id, householdCode, stateJson, version, createdAt, updatedAt] = params
      if ([...this.households.values()].some((entry) => entry.household_code === householdCode)) {
        throw new Error('unique constraint failed: households.household_code')
      }
      this.households.set(String(id), {
        id,
        household_code: householdCode,
        state_json: stateJson,
        version,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return { success: true, changes: 1 }
    }

    if (sql.startsWith('INSERT INTO members')) {
      if (sql.includes('SELECT')) {
        const [id, householdId, email, createdAt, countHouseholdId, existingHouseholdId, existingEmail] = params
        const currentCount = this.members.filter((entry) => entry.household_id === countHouseholdId).length
        if (currentCount >= 2) {
          return { success: true, changes: 0 }
        }
        if (this.members.some((entry) => entry.household_id === existingHouseholdId && entry.email === existingEmail)) {
          return { success: true, changes: 0 }
        }
        this.members.push({
          id,
          household_id: householdId,
          email,
          created_at: createdAt,
        })
        return { success: true, changes: 1 }
      }

      const [id, householdId, email, createdAt] = params
      if (this.members.some((entry) => entry.household_id === householdId && entry.email === email)) {
        throw new Error('unique constraint failed: members.household_id, members.email')
      }
      this.members.push({
        id,
        household_id: householdId,
        email,
        created_at: createdAt,
      })
      return { success: true, changes: 1 }
    }

    if (sql.startsWith('UPDATE households SET state_json = ?, version = version + 1')) {
      const [stateJson, updatedAt, id, expectedVersion] = params
      const row = this.households.get(String(id))
      if (!row || row.version !== expectedVersion) {
        return { success: true, changes: 0 }
      }
      row.state_json = stateJson
      row.version = Number(row.version) + 1
      row.updated_at = updatedAt
      return { success: true, changes: 1 }
    }

    return { success: true, changes: 0 }
  }
}

function makeRepository(db = new MemoryDatabase()): { repo: Repository; db: MemoryDatabase } {
  return { repo: new Repository(db), db }
}

describe('Repository', () => {
  it('creates a household, then allows another member to join by code', async () => {
    const { repo, db } = makeRepository()
    const initialState = {
      stores: [],
      items: [],
      trips: [],
    }

    const created = await repo.createHouseholdForEmail('alice@example.com', initialState)
    expect(created.members).toHaveLength(1)
    expect(created.household.version).toBe(1)

    const joined = await repo.joinHouseholdByCode('bob@example.com', created.household.code)
    expect(joined).not.toBeNull()
    expect(joined?.members).toHaveLength(2)
    expect(db.members).toHaveLength(2)
  })

  it('rejects joining a household that already has two members', async () => {
    const { repo } = makeRepository()
    const initialState = {
      stores: [],
      items: [],
      trips: [],
    }

    const created = await repo.createHouseholdForEmail('alice@example.com', initialState)
    await repo.joinHouseholdByCode('bob@example.com', created.household.code)

    await expect(repo.joinHouseholdByCode('charlie@example.com', created.household.code)).rejects.toThrow(
      'household_full',
    )
  })

  it('rejects a concurrent join when another member arrives before the insert executes', async () => {
    class RaceDatabase extends MemoryDatabase {
      private injected = false

      async execute(sql: string, params: unknown[]): Promise<{ success: boolean; changes?: number }> {
        if (sql.includes('INSERT INTO members') && sql.includes('SELECT') && !this.injected) {
          this.injected = true
          const householdId = String(params[1])
          this.members.push({
            id: 'member_race',
            household_id: householdId,
            email: 'racer@example.com',
            created_at: 999,
          })
        }

        return super.execute(sql, params)
      }
    }

    const { repo } = makeRepository(new RaceDatabase())
    const initialState = {
      stores: [],
      items: [],
      trips: [],
    }

    const created = await repo.createHouseholdForEmail('alice@example.com', initialState)

    await expect(repo.joinHouseholdByCode('bob@example.com', created.household.code)).rejects.toThrow(
      'household_full',
    )
  })

  it('only updates household state when the version matches', async () => {
    const { repo } = makeRepository()
    const initialState = {
      stores: [],
      items: [],
      trips: [],
    }

    await repo.createHouseholdForEmail('alice@example.com', initialState)

    const firstUpdate = await repo.updateHouseholdState('alice@example.com', initialState, 1)
    expect(firstUpdate.updated).toBe(true)
    expect(firstUpdate.household.household.version).toBe(2)

    const staleUpdate = await repo.updateHouseholdState('alice@example.com', initialState, 1)
    expect(staleUpdate.updated).toBe(false)
    expect(staleUpdate.household.household.version).toBe(2)
  })
})
