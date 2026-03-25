import { describe, expect, it } from 'vitest'
import { appendTripCapped } from '../src/domain/trips'
import type { Trip } from '../src/domain/models'

function makeTrip(id: number): Trip {
  return {
    id: `trip-${id}`,
    storeId: 'store-1',
    completedAt: id,
    sequence: [`item-${id}`],
  }
}

describe('appendTripCapped', () => {
  it('keeps only the latest 200 trips', () => {
    const existing = Array.from({ length: 200 }, (_, index) => makeTrip(index + 1))
    const next = appendTripCapped(existing, makeTrip(201))

    expect(next).toHaveLength(200)
    expect(next[0]?.id).toBe('trip-2')
    expect(next.at(-1)?.id).toBe('trip-201')
  })

  it('keeps all trips when below limit', () => {
    const existing = [makeTrip(1), makeTrip(2)]
    const next = appendTripCapped(existing, makeTrip(3), 10)

    expect(next.map((trip) => trip.id)).toEqual(['trip-1', 'trip-2', 'trip-3'])
  })
})
