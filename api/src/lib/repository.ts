import type { AuthUser, Household, HouseholdMember, Session, SyncableState, VerificationToken } from './models'
import { createHouseholdCode, createId } from './crypto'
import { sanitizeSyncableState } from './models'
import type { DatabaseLike } from './runtime'

interface HouseholdRow {
  id: string
  household_code: string
  state_json: string
  version: number
  created_at: number
  updated_at: number
}

interface MemberRow {
  id: string
  household_id: string
  email: string
  created_at: number
}

interface UserRow {
  id: string
  email: string
  created_at: number
}

interface SessionRow {
  token: string
  user_id: string
  expires_at: number
  created_at: number
}

interface VerificationTokenRow {
  token: string
  email: string
  expires_at: number
  created_at: number
  consumed_at: number | null
}

function mapHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    code: row.household_code,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMember(row: MemberRow): HouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    createdAt: row.created_at,
  }
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
  }
}

function mapSession(row: SessionRow): Session {
  return {
    token: row.token,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

function mapVerificationToken(row: VerificationTokenRow): VerificationToken {
  return {
    token: row.token,
    email: row.email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
  }
}

export interface HouseholdRecord {
  household: Household
  state: SyncableState
  members: HouseholdMember[]
}

export class Repository {
  constructor(private readonly db: DatabaseLike) {}

  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const row = await this.db
      .prepare('SELECT id, email, created_at FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserRow>()

    return row ? mapUser(row) : null
  }

  async createUser(email: string): Promise<AuthUser> {
    const existing = await this.getUserByEmail(email)
    if (existing) return existing

    const user: AuthUser = { id: createId('user'), email }
    const createdAt = Date.now()

    await this.db
      .prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
      .bind(user.id, user.email, createdAt)
      .run()

    return user
  }

  async createSession(userId: string, token: string, expiresAt: number): Promise<Session> {
    const createdAt = Date.now()
    await this.db
      .prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(token, userId, expiresAt, createdAt)
      .run()

    return { token, userId, expiresAt, createdAt }
  }

  async getSession(token: string): Promise<Session | null> {
    const row = await this.db
      .prepare('SELECT token, user_id, expires_at, created_at FROM sessions WHERE token = ? LIMIT 1')
      .bind(token)
      .first<SessionRow>()

    return row ? mapSession(row) : null
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }

  async saveVerificationToken(token: string, email: string, expiresAt: number): Promise<VerificationToken> {
    const createdAt = Date.now()
    await this.db
      .prepare(
        'INSERT INTO verification_tokens (token, email, expires_at, created_at, consumed_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .bind(token, email, expiresAt, createdAt)
      .run()

    return {
      token,
      email,
      expiresAt,
      createdAt,
      consumedAt: null,
    }
  }

  async consumeVerificationToken(token: string): Promise<VerificationToken | null> {
    const row = await this.db
      .prepare(
        'SELECT token, email, expires_at, created_at, consumed_at FROM verification_tokens WHERE token = ? LIMIT 1',
      )
      .bind(token)
      .first<VerificationTokenRow>()

    if (!row || row.consumed_at !== null || row.expires_at < Date.now()) {
      return null
    }

    await this.db
      .prepare('UPDATE verification_tokens SET consumed_at = ? WHERE token = ?')
      .bind(Date.now(), token)
      .run()

    return mapVerificationToken(row)
  }

  async getHouseholdByMemberEmail(email: string): Promise<HouseholdRecord | null> {
    const member = await this.db
      .prepare('SELECT id, household_id, email, created_at FROM members WHERE email = ? LIMIT 1')
      .bind(email)
      .first<MemberRow>()

    if (!member) return null

    const household = await this.db
      .prepare(
        'SELECT id, household_code, state_json, version, created_at, updated_at FROM households WHERE id = ? LIMIT 1',
      )
      .bind(member.household_id)
      .first<HouseholdRow>()

    if (!household) return null

    const members = await this.db
      .prepare('SELECT id, household_id, email, created_at FROM members WHERE household_id = ? ORDER BY created_at ASC')
      .bind(household.id)
      .all<MemberRow>()

    return {
      household: mapHousehold(household),
      state: sanitizeSyncableState(JSON.parse(household.state_json)) ?? { stores: [], items: [], trips: [] },
      members: members.results.map(mapMember),
    }
  }

  async getHouseholdByCode(code: string): Promise<HouseholdRecord | null> {
    const household = await this.db
      .prepare(
        'SELECT id, household_code, state_json, version, created_at, updated_at FROM households WHERE household_code = ? LIMIT 1',
      )
      .bind(code)
      .first<HouseholdRow>()

    if (!household) return null

    const members = await this.db
      .prepare('SELECT id, household_id, email, created_at FROM members WHERE household_id = ? ORDER BY created_at ASC')
      .bind(household.id)
      .all<MemberRow>()

    return {
      household: mapHousehold(household),
      state: sanitizeSyncableState(JSON.parse(household.state_json)) ?? { stores: [], items: [], trips: [] },
      members: members.results.map(mapMember),
    }
  }

  async createHouseholdForEmail(email: string, initialState: SyncableState): Promise<HouseholdRecord> {
    const existing = await this.getHouseholdByMemberEmail(email)
    if (existing) return existing

    const now = Date.now()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const householdId = createId('household')
      const code = await this.createUniqueCode()
      const memberId = createId('member')

      try {
        await this.db
          .prepare(
            'INSERT INTO households (id, household_code, state_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind(householdId, code, JSON.stringify(initialState), 1, now, now)
          .run()

        await this.db
          .prepare('INSERT INTO members (id, household_id, email, created_at) VALUES (?, ?, ?, ?)')
          .bind(memberId, householdId, email, now)
          .run()

        return {
          household: {
            id: householdId,
            code,
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
          state: initialState,
          members: [
            {
              id: memberId,
              householdId,
              email,
              createdAt: now,
            },
          ],
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.toLowerCase().includes('unique')) {
          throw error
        }
      }
    }

    throw new Error('Could not create a unique household code after 5 attempts.')
  }

  async joinHouseholdByCode(email: string, code: string): Promise<HouseholdRecord | null> {
    const household = await this.getHouseholdByCode(code)
    if (!household) return null

    const existing = await this.getHouseholdByMemberEmail(email)
    if (existing) return existing

    const createdAt = Date.now()
    const result = await this.db
      .prepare(
        'INSERT INTO members (id, household_id, email, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM members WHERE household_id = ?) < 2 AND NOT EXISTS (SELECT 1 FROM members WHERE household_id = ? AND email = ?)',
      )
      .bind(createId('member'), household.household.id, email, createdAt, household.household.id, household.household.id, email)
      .run()

    if ((result.changes ?? 0) === 0) {
      const current = await this.getHouseholdByMemberEmail(email)
      if (current) return current

      throw new Error('household_full')
    }

    return this.getHouseholdByCode(code)
  }

  async updateHouseholdState(
    email: string,
    nextState: SyncableState,
    expectedVersion: number,
  ): Promise<{ updated: true; household: HouseholdRecord } | { updated: false; household: HouseholdRecord }> {
    const record = await this.getHouseholdByMemberEmail(email)
    if (!record) {
      throw new Error('no_household')
    }

    const now = Date.now()
    const result = await this.db
      .prepare('UPDATE households SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
      .bind(JSON.stringify(nextState), now, record.household.id, expectedVersion)
      .run()

    if ((result.changes ?? 0) === 0) {
      return { updated: false, household: record }
    }

    const updated = await this.getHouseholdByMemberEmail(email)
    if (!updated) {
      throw new Error('no_household')
    }

    return { updated: true, household: updated }
  }

  async createUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = createHouseholdCode()
      const existing = await this.getHouseholdByCode(code)
      if (!existing) return code
    }

    throw new Error('Could not allocate household code.')
  }
}
