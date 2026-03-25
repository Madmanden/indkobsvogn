import type { Trip } from './models'

export function appendTripCapped(trips: Trip[], trip: Trip, maxTrips = 200): Trip[] {
  return [...trips, trip].slice(-maxTrips)
}
