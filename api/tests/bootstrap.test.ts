import { describe, expect, it } from 'vitest'
import { ensureDatabaseReady } from '../src/lib/bootstrap'
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
  it('creates the rate_limits table during bootstrap', async () => {
    const db = new BootstrapDatabase()

    await ensureDatabaseReady(db)

    expect(db.statements).toContain(
      'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);',
    )
  })
})
