import { Hono } from 'hono'
import type { Env } from '../lib/runtime'
import { jsonError } from '../lib/http'
import { Repository } from '../lib/repository'
import { parseSyncableState } from '../lib/state'
import type { AuthedContextVariables } from '../lib/auth'
import { ensureDatabaseReady } from '../lib/bootstrap'

export const householdRouter = new Hono<{ Bindings: Env; Variables: AuthedContextVariables }>()

householdRouter.post('/create', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const user = c.get('user')
  const body = (await c.req.json().catch(() => null)) as { state?: unknown } | null
  const initialState = parseSyncableState(body?.state) ?? {
    stores: [],
    items: [],
    trips: [],
  }

  const repository = new Repository(c.env.DB)
  const existing = await repository.getHouseholdByMemberEmail(user.email)
  if (existing) {
    return c.json(existing)
  }

  const created = await repository.createHouseholdForEmail(user.email, initialState)
  return c.json(created)
})

householdRouter.post('/join', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const user = c.get('user')
  const body = (await c.req.json().catch(() => null)) as { code?: string; state?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) {
    return jsonError(c, 400, 'missing_code')
  }

  const repository = new Repository(c.env.DB)
  const existing = await repository.getHouseholdByMemberEmail(user.email)
  if (existing) {
    return c.json(existing)
  }

  try {
    const joined = await repository.joinHouseholdByCode(user.email, code)
    if (!joined) {
      return jsonError(c, 404, 'unknown_household')
    }

    return c.json(joined)
  } catch (error) {
    if (error instanceof Error && error.message === 'household_full') {
      return jsonError(c, 409, 'household_full')
    }

    throw error
  }
})

householdRouter.get('/me', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const user = c.get('user')
  const repository = new Repository(c.env.DB)
  const household = await repository.getHouseholdByMemberEmail(user.email)

  if (!household) {
    return c.json(
      {
        error: 'no_household',
        user,
      },
      404,
    )
  }

  return c.json({
    user,
    ...household,
  })
})
