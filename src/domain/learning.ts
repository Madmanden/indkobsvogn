import type { ListItem, Trip } from './models'

const DEFAULT_WEIGHTED_POSITION = 1
const MS_PER_DAY = 1000 * 60 * 60 * 24

function calculateTripWeight(completedAt: number, now: number, lambda: number): number {
  const daysAgo = Math.max(0, (now - completedAt) / MS_PER_DAY)
  return Math.exp(-lambda * daysAgo)
}

function calculateNormalizedIndex(index: number, tripLength: number): number {
  if (tripLength <= 0) return 0
  if (tripLength === 1) return 0
  return index / (tripLength - 1)
}

export function recalculateWeightedPositions(
  list: ListItem[],
  trips: Trip[],
  now = Date.now(),
  lambda = 0.05,
): ListItem[] {
  return list.map((listItem) => {
    let weightedTotal = 0
    let weightSum = 0

    for (const trip of trips) {
      const index = trip.sequence.indexOf(listItem.itemId)
      if (index < 0) continue

      const normalizedIndex = calculateNormalizedIndex(index, trip.sequence.length)
      const weight = calculateTripWeight(trip.completedAt, now, lambda)

      weightedTotal += normalizedIndex * weight
      weightSum += weight
    }

    const weightedPosition =
      weightSum > 0 ? weightedTotal / weightSum : DEFAULT_WEIGHTED_POSITION

    return {
      ...listItem,
      weightedPosition,
    }
  })
}
