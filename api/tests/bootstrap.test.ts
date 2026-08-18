import { describe, expect, it, beforeEach } from 'vitest'
import { ensureDatabaseReady, resetBootstrapForTests } from '../src/lib/bootstrap'
import type { DatabaseLike, PreparedStatementLike } from '../src/lib/runtime'

class BootstrapDatabase implements DatabaseLike {
  statements: string[] = []

  prepare(): PreparedStatementLike {
    throw new Error('prepare should not be called during bootstrap')
  }

  async exec(sql: string): Promise<void> {
    this.statements.push(sql)
  }
}

describe('ensureDatabaseReady', () => {
  beforeEach(() => {
    resetBootstrapForTests()
  })

  it('creates the rate_limits table during bootstrap', async () => {
    const db = new BootstrapDatabase()

    await ensureDatabaseReady(db)

    expect(db.statements).toContain(
      'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);',
    )
  })

  it('does not poison the isolate when a table fails to build, and retries afterwards', async () => {
    let fail = true
    const db = new BootstrapDatabase()
    const originalExec = db.exec.bind(db)
    db.exec = async (sql: string): Promise<void> => {
      if (fail) throw new Error('transient schema error')
      await originalExec(sql)
    }

    await expect(ensureDatabaseReady(db)).rejects.toThrow('transient schema error')

    fail = false
    const db2 = new BootstrapDatabase()
    await expect(ensureDatabaseReady(db2)).resolves.toBeUndefined()
    expect(db2.statements.length).toBeGreaterThan(0)
  })
})
