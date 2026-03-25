import { Hono } from 'hono'
import type { Env } from '../lib/runtime'
import { jsonError } from '../lib/http'
import { Repository } from '../lib/repository'
import { parseSyncableState } from '../lib/state'
import type { AuthedContextVariables } from '../lib/auth'
import { ensureDatabaseReady } from '../lib/bootstrap'

export const stateRouter = new Hono<{ Bindings: Env; Variables: AuthedContextVariables }>()

stateRouter.get('/', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const user = c.get('user')
  const repository = new Repository(c.env.DB)
  const record = await repository.getHouseholdByMemberEmail(user.email)

  if (!record) {
    return jsonError(c, 404, 'no_household')
  }

  return c.json({
    state: record.state,
    version: record.household.version,
  })
})

stateRouter.put('/', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const user = c.get('user')
  const body = (await c.req.json().catch(() => null)) as { state?: unknown; version?: unknown } | null
  const version = typeof body?.version === 'number' && Number.isFinite(body.version) ? body.version : null
  const state = parseSyncableState(body?.state)

  if (version === null || !state) {
    return jsonError(c, 400, 'invalid_payload')
  }

  const repository = new Repository(c.env.DB)
  const result = await repository.updateHouseholdState(user.email, state, version)

  if (!result.updated) {
    return c.json(
      {
        conflict: true,
        state: result.household.state,
        version: result.household.household.version,
      },
      409,
    )
  }

  return c.json({
    conflict: false,
    state: result.household.state,
    version: result.household.household.version,
  })
})
