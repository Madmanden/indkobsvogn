import { describe, expect, it } from 'vitest'
import type { SyncableState, Trip } from '../src/lib/models'
import {
  areSyncableStatesEqual,
  haveSameSyncableCatalog,
  mergeTripHistories,
} from '../src/lib/state'

function trip(id: string, storeId: string, completedAt: number): Trip {
  return {
    id,
    storeId,
    completedAt,
    sequence: ['item-a', 'item-b'],
  }
}

function state(trips: Trip[], itemName = 'Mælk'): SyncableState {
  return {
    stores: [
      {
        id: 'store-1',
        name: 'Store 1',
        subtitle: 'Test',
        icon: '🛒',
        createdAt: 0,
      },
    ],
    items: [
      {
        id: 'item-a',
        name: itemName,
        defaultQuantity: 1,
        createdAt: 0,
        lastUsedAt: 0,
      },
    ],
    trips,
  }
}

describe('sync state merge helpers', () => {
  it('treats trip-only differences as a compatible catalog', () => {
    const local = state([trip('local', 'store-1', 1)])
    const remote = state([trip('remote', 'store-1', 2)])

    expect(haveSameSyncableCatalog(local, remote)).toBe(true)
    expect(areSyncableStatesEqual(local, remote)).toBe(false)
    expect(haveSameSyncableCatalog(local, state(remote.trips, 'Havremælk'))).toBe(false)
  })

  it('unions concurrent trip histories without duplicates', () => {
    const shared = trip('shared', 'store-1', 1)
    const merged = mergeTripHistories(
      [shared, trip('local', 'store-1', 2)],
      [shared, trip('remote', 'store-1', 3)],
    )

    expect(merged.map((entry) => entry.id)).toEqual(['shared', 'local', 'remote'])
  })

  it('caps merged history per store without deleting another stores observations', () => {
    const merged = mergeTripHistories(
      [
        trip('store-1-old', 'store-1', 1),
        trip('store-2-old', 'store-2', 2),
        trip('store-1-new', 'store-1', 3),
      ],
      [
        trip('store-2-new', 'store-2', 4),
        trip('store-1-latest', 'store-1', 5),
      ],
      2,
    )

    expect(merged.filter((entry) => entry.storeId === 'store-1').map((entry) => entry.id)).toEqual([
      'store-1-new',
      'store-1-latest',
    ])
    expect(merged.filter((entry) => entry.storeId === 'store-2').map((entry) => entry.id)).toEqual([
      'store-2-old',
      'store-2-new',
    ])
  })
})
