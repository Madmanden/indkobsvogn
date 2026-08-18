import type { SyncableState, Trip } from './models'
import { sanitizeSyncableState, stripLocalOnlyFields, type AppState } from './models'

const MAX_TRIPS_PER_STORE = 200

export function parseSyncableState(raw: unknown): SyncableState | null {
  return sanitizeSyncableState(raw)
}

export function toStoredState(appState: AppState): SyncableState {
  return stripLocalOnlyFields(appState)
}

export function areSyncableStatesEqual(left: SyncableState, right: SyncableState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function haveSameSyncableCatalog(left: SyncableState, right: SyncableState): boolean {
  return (
    JSON.stringify(left.stores) === JSON.stringify(right.stores) &&
    JSON.stringify(left.items) === JSON.stringify(right.items)
  )
}

export function mergeTripHistories(
  left: Trip[],
  right: Trip[],
  maxTripsPerStore = MAX_TRIPS_PER_STORE,
): Trip[] {
  const byId = new Map<string, Trip>()

  for (const trip of [...left, ...right]) {
    const existing = byId.get(trip.id)
    if (!existing || trip.completedAt >= existing.completedAt) {
      byId.set(trip.id, trip)
    }
  }

  const sorted = [...byId.values()].sort(
    (a, b) => a.completedAt - b.completedAt || a.id.localeCompare(b.id),
  )
  const countByStore = new Map<string, number>()

  for (const trip of sorted) {
    countByStore.set(trip.storeId, (countByStore.get(trip.storeId) ?? 0) + 1)
  }

  const dropsRemaining = new Map(
    [...countByStore.entries()].map(([storeId, count]) => [
      storeId,
      Math.max(0, count - maxTripsPerStore),
    ]),
  )

  return sorted.filter((trip) => {
    const remaining = dropsRemaining.get(trip.storeId) ?? 0
    if (remaining <= 0) return true

    dropsRemaining.set(trip.storeId, remaining - 1)
    return false
  })
}
