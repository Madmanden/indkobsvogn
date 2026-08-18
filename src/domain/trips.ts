import type { Trip } from './models'

export function appendTripCapped(
  trips: Trip[],
  trip: Trip,
  maxTripsPerStore = 200,
): Trip[] {
  const next = [...trips, trip]
  const storeTrips = next
    .filter((candidate) => candidate.storeId === trip.storeId)
    .sort((a, b) => a.completedAt - b.completedAt || a.id.localeCompare(b.id))

  if (storeTrips.length <= maxTripsPerStore) return next

  const removeIds = new Set(
    storeTrips
      .slice(0, storeTrips.length - maxTripsPerStore)
      .map((candidate) => candidate.id),
  )

  return next.filter(
    (candidate) => candidate.storeId !== trip.storeId || !removeIds.has(candidate.id),
  )
}
