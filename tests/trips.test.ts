import { describe, expect, it } from 'vitest'
import { appendTripCapped } from '../src/domain/trips'
import type { Trip } from '../src/domain/models'

function makeTrip(id: number, storeId = 'store-1'): Trip {
  return {
    id: `${storeId}-trip-${id}`,
    storeId,
    completedAt: id,
    sequence: [`item-${id}`],
  }
}

describe('appendTripCapped', () => {
  it('keeps only the latest 200 trips for the updated store', () => {
    const existing = Array.from({ length: 200 }, (_, index) => makeTrip(index + 1))
    const next = appendTripCapped(existing, makeTrip(201))

    expect(next).toHaveLength(200)
    expect(next[0]?.id).toBe('store-1-trip-2')
    expect(next.at(-1)?.id).toBe('store-1-trip-201')
  })

  it('keeps all trips when below the per-store limit', () => {
    const existing = [makeTrip(1), makeTrip(2)]
    const next = appendTripCapped(existing, makeTrip(3), 10)

    expect(next.map((trip) => trip.id)).toEqual([
      'store-1-trip-1',
      'store-1-trip-2',
      'store-1-trip-3',
    ])
  })

  it('does not evict another stores history when one store reaches its cap', () => {
    const existing = [
      makeTrip(1, 'store-2'),
      makeTrip(2, 'store-1'),
      makeTrip(3, 'store-2'),
      makeTrip(4, 'store-1'),
    ]

    const next = appendTripCapped(existing, makeTrip(5, 'store-1'), 2)

    expect(next.filter((trip) => trip.storeId === 'store-1').map((trip) => trip.id)).toEqual([
      'store-1-trip-4',
      'store-1-trip-5',
    ])
    expect(next.filter((trip) => trip.storeId === 'store-2').map((trip) => trip.id)).toEqual([
      'store-2-trip-1',
      'store-2-trip-3',
    ])
  })
})
