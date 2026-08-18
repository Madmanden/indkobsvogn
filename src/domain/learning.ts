import type { ListItem, Trip } from './models'
import { createId } from '../utils/id'

export const UNLEARNED_POSITION = 2
const MS_PER_DAY = 1000 * 60 * 60 * 24

function calculateTripWeight(completedAt: number, now: number, lambda: number): number {
  const daysAgo = Math.max(0, (now - completedAt) / MS_PER_DAY)
  return Math.exp(-lambda * daysAgo)
}

/**
 * Learn a route position from pairwise ordering evidence.
 *
 * Each trip contributes one comparison between the item and every other item
 * on that trip. Items observed before this item contribute toward the item
 * being later in the route; items observed after it contribute toward the
 * item being earlier. A one-item trip therefore contributes no positional
 * evidence at all.
 *
 * Learned positions stay in [0, 1]. UNLEARNED_POSITION is deliberately
 * outside that range so a genuinely learned "last item" does not collide
 * with an item we have never learned.
 */
export function getLearnedPosition(
  itemId: string,
  trips: Trip[],
  now = Date.now(),
  lambda = 0.05,
): number {
  let weightedBefore = 0
  let weightedComparisons = 0

  for (const trip of trips) {
    if (trip.sequence.length < 2) continue

    const index = trip.sequence.indexOf(itemId)
    if (index < 0) continue

    const comparisonCount = trip.sequence.length - 1
    const weight = calculateTripWeight(trip.completedAt, now, lambda)

    weightedBefore += index * weight
    weightedComparisons += comparisonCount * weight
  }

  return weightedComparisons > 0
    ? weightedBefore / weightedComparisons
    : UNLEARNED_POSITION
}

export function createSyntheticTrip(
  itemIds: string[],
  storeId: string,
  now = Date.now(),
): Trip {
  return {
    id: createId('trip-synthetic'),
    storeId,
    completedAt: now,
    sequence: [...itemIds],
  }
}

export function recalculateWeightedPositions(
  list: ListItem[],
  trips: Trip[],
  now = Date.now(),
  lambda = 0.05,
): ListItem[] {
  return list.map((listItem) => ({
    ...listItem,
    weightedPosition: getLearnedPosition(listItem.itemId, trips, now, lambda),
  }))
}
