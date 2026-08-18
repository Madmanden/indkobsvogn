import { Hono } from 'hono'
import type { Env } from '../lib/runtime'
import { jsonError } from '../lib/http'
import { Repository } from '../lib/repository'
import {
  areSyncableStatesEqual,
  haveSameSyncableCatalog,
  mergeTripHistories,
  parseSyncableState,
} from '../lib/state'
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

  if (result.updated) {
    return c.json({
      conflict: false,
      state: result.household.state,
      version: result.household.household.version,
    })
  }

  // Re-read after a failed optimistic update. The record returned by the
  // repository may have been fetched before the concurrent writer committed.
  const current = await repository.getHouseholdByMemberEmail(user.email)
  if (!current) {
    return jsonError(c, 404, 'no_household')
  }

  if (areSyncableStatesEqual(state, current.state)) {
    return c.json({
      conflict: false,
      state: current.state,
      version: current.household.version,
    })
  }

  // Completed trips are append-only observations. If stores and the item
  // catalog are unchanged, preserving both devices' trip histories is safe.
  // Any catalog conflict remains explicit rather than guessing at a merge.
  if (haveSameSyncableCatalog(state, current.state)) {
    const mergedState = {
      ...state,
      trips: mergeTripHistories(current.state.trips, state.trips),
    }

    if (areSyncableStatesEqual(mergedState, current.state)) {
      return c.json({
        conflict: false,
        state: current.state,
        version: current.household.version,
      })
    }

    const mergedResult = await repository.updateHouseholdState(
      user.email,
      mergedState,
      current.household.version,
    )

    if (mergedResult.updated) {
      return c.json({
        conflict: false,
        state: mergedResult.household.state,
        version: mergedResult.household.household.version,
      })
    }
  }

  const latest = await repository.getHouseholdByMemberEmail(user.email)
  if (!latest) {
    return jsonError(c, 404, 'no_household')
  }

  return c.json(
    {
      conflict: true,
      state: latest.state,
      version: latest.household.version,
    },
    409,
  )
})
