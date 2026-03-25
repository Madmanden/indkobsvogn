import { describe, expect, it } from 'vitest'
import { completeTrip, persistWeightedPositions } from '../src/domain/app-state'
import type { AppState, Trip } from '../src/domain/models'

function makeState(trips: Trip[] = []): AppState {
  return {
    stores: [
      {
        id: 'store-1',
        name: 'Test Store',
        subtitle: '0 ture',
        icon: 'S',
        createdAt: 0,
      },
    ],
    selectedStoreId: 'store-1',
    items: [
      {
        id: 'item-a',
        name: 'A',
        defaultQuantity: 1,
        createdAt: 0,
        lastUsedAt: 0,
      },
      {
        id: 'item-b',
        name: 'B',
        defaultQuantity: 1,
        createdAt: 0,
        lastUsedAt: 0,
      },
    ],
    list: [
      {
        itemId: 'item-a',
        storeId: 'store-1',
        quantity: 1,
        addedAt: 1,
        weightedPosition: 1,
      },
      {
        itemId: 'item-b',
        storeId: 'store-1',
        quantity: 1,
        addedAt: 2,
        weightedPosition: 1,
      },
    ],
    trips,
    isShopping: true,
    currentSequence: ['item-a', 'item-b'],
  }
}

describe('persistWeightedPositions', () => {
  it('stores recomputed weighted positions on the list', () => {
    const completedAt = 1000
    const state = makeState([
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt,
        sequence: ['item-a', 'item-b'],
      },
    ])

    const persisted = persistWeightedPositions(state, completedAt)

    // With formula index/(length-1), a 2-item trip gives [0, 1]
    expect(persisted.list[0]?.weightedPosition).toBe(0)
    expect(persisted.list[1]?.weightedPosition).toBe(1)
  })
})

describe('completeTrip', () => {
  it('creates a trip, clears shopping state, and clears the active list', () => {
    const state = {
      ...makeState(),
      stores: [
        ...makeState().stores,
        {
          id: 'store-2',
          name: 'Other Store',
          subtitle: '0 ture',
          icon: '2',
          createdAt: 0,
        },
      ],
      list: [
        ...makeState().list,
        {
          itemId: 'item-a',
          storeId: 'store-2',
          quantity: 1,
          addedAt: 3,
          weightedPosition: 1,
        },
      ],
      selectedStoreId: 'store-1',
    }
    const completed = completeTrip(state, 1000)

    expect(completed.isShopping).toBe(false)
    expect(completed.currentSequence).toEqual([])
    expect(completed.trips).toHaveLength(1)
    expect(completed.trips[0]?.storeId).toBe('store-1')
    expect(completed.trips[0]?.sequence).toEqual(['item-a', 'item-b'])
    expect(completed.list).toEqual([
      expect.objectContaining({
        itemId: 'item-a',
        storeId: 'store-2',
      }),
    ])
  })

  it('caps trip history to the latest 200 trips when adding a new completed trip', () => {
    const trips = Array.from({ length: 200 }, (_, index) => ({
      id: `trip-${index + 1}`,
      storeId: 'store-1',
      completedAt: index + 1,
      sequence: ['item-a'],
    }))

    const completed = completeTrip(makeState(trips), 5000)

    expect(completed.trips).toHaveLength(200)
    expect(completed.trips[0]?.id).toBe('trip-2')
  })

  it('recomputes weights per store instead of mixing trip history across stores', () => {
    const state: AppState = {
      ...makeState([
        {
          id: 'trip-1',
          storeId: 'store-1',
          completedAt: 1000,
          sequence: ['item-a', 'item-b'],
        },
        {
          id: 'trip-2',
          storeId: 'store-2',
          completedAt: 1000,
          sequence: ['item-b', 'item-a'],
        },
      ]),
      stores: [
        {
          id: 'store-1',
          name: 'Store 1',
          subtitle: '0 ture',
          icon: '1',
          createdAt: 0,
        },
        {
          id: 'store-2',
          name: 'Store 2',
          subtitle: '0 ture',
          icon: '2',
          createdAt: 0,
        },
      ],
      list: [
        {
          itemId: 'item-a',
          storeId: 'store-1',
          quantity: 1,
          addedAt: 1,
          weightedPosition: 1,
        },
        {
          itemId: 'item-b',
          storeId: 'store-1',
          quantity: 1,
          addedAt: 2,
          weightedPosition: 1,
        },
        {
          itemId: 'item-a',
          storeId: 'store-2',
          quantity: 1,
          addedAt: 3,
          weightedPosition: 1,
        },
        {
          itemId: 'item-b',
          storeId: 'store-2',
          quantity: 1,
          addedAt: 4,
          weightedPosition: 1,
        },
      ],
    }

    const persisted = persistWeightedPositions(state, 1000)

    // store-1: item-a at index 0 → 0/(2-1)=0; store-2: item-a at index 1 → 1/(2-1)=1
    expect(persisted.list.find((item) => item.itemId === 'item-a' && item.storeId === 'store-1')?.weightedPosition).toBe(0)
    expect(persisted.list.find((item) => item.itemId === 'item-a' && item.storeId === 'store-2')?.weightedPosition).toBe(1)
  })
})
