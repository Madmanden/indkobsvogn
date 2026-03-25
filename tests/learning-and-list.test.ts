import { describe, expect, it } from 'vitest'
import { persistWeightedPositions } from '../src/domain/app-state'
import { recalculateWeightedPositions } from '../src/domain/learning'
import type { AppState, ListItem, Trip } from '../src/domain/models'
import { getPlanningRows } from '../src/utils/list'

function makeList(): ListItem[] {
  return [
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
  ]
}

function makeState(trips: Trip[]): AppState {
  return {
    stores: [
      {
        id: 'store-1',
        name: 'Test Store',
        subtitle: '0 ture',
        icon: '🛒',
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
    list: makeList(),
    trips,
    isShopping: false,
    currentSequence: [],
  }
}

describe('recalculateWeightedPositions', () => {
  it('puts unseen items at default bottom position', () => {
    const list = makeList()
    const trips: Trip[] = [
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: 100,
        sequence: ['item-a'],
      },
    ]

    const weighted = recalculateWeightedPositions(list, trips, 100)

    const itemA = weighted.find((item) => item.itemId === 'item-a')
    const itemB = weighted.find((item) => item.itemId === 'item-b')

    expect(itemA?.weightedPosition).toBe(0)
    expect(itemB?.weightedPosition).toBe(1)
  })

  it('applies weighted averaging across trips', () => {
    const list = makeList()
    const trips: Trip[] = [
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: 100,
        sequence: ['item-a', 'item-b'],
      },
      {
        id: 'trip-2',
        storeId: 'store-1',
        completedAt: 100,
        sequence: ['item-b', 'item-a'],
      },
    ]

    const weighted = recalculateWeightedPositions(list, trips, 100, 0.05)

    const itemA = weighted.find((item) => item.itemId === 'item-a')
    const itemB = weighted.find((item) => item.itemId === 'item-b')

    expect(itemA?.weightedPosition).toBe(0.5)
    expect(itemB?.weightedPosition).toBe(0.5)
  })

  it('maps the final item in a trip to normalized position 1', () => {
    const list = makeList()
    const trips: Trip[] = [
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: 100,
        sequence: ['item-a', 'item-b'],
      },
    ]

    const weighted = recalculateWeightedPositions(list, trips, 100)

    const itemA = weighted.find((item) => item.itemId === 'item-a')
    const itemB = weighted.find((item) => item.itemId === 'item-b')

    expect(itemA?.weightedPosition).toBe(0)
    expect(itemB?.weightedPosition).toBe(1)
  })

  it('applies recency weighting (newer trips matter more)', () => {
    const list = makeList()
    const now = 10 * 24 * 60 * 60 * 1000
    const oneDayMs = 24 * 60 * 60 * 1000

    const trips: Trip[] = [
      {
        id: 'old-trip',
        storeId: 'store-1',
        completedAt: now - 9 * oneDayMs,
        sequence: ['item-b', 'item-a'],
      },
      {
        id: 'new-trip',
        storeId: 'store-1',
        completedAt: now - oneDayMs,
        sequence: ['item-a', 'item-b'],
      },
    ]

    const weighted = recalculateWeightedPositions(list, trips, now, 0.2)

    const itemA = weighted.find((item) => item.itemId === 'item-a')
    const itemB = weighted.find((item) => item.itemId === 'item-b')

    expect((itemA?.weightedPosition ?? 1) < (itemB?.weightedPosition ?? 1)).toBe(true)
  })
})

describe('getPlanningRows', () => {
  it('derives order from current trip history (no stale persisted ordering)', () => {
    const completedAt = Date.now() - 60 * 60 * 1000

    const withTrips = persistWeightedPositions(
      makeState([
        {
          id: 'trip-1',
          storeId: 'store-1',
          completedAt,
          sequence: ['item-a', 'item-b'],
        },
      ]),
      completedAt,
    )

    const initialRows = getPlanningRows(withTrips)
    expect(initialRows.map((row) => row.id)).toEqual(['item-a', 'item-b'])

    const afterTripMutation = persistWeightedPositions(
      {
        ...withTrips,
        trips: [
          {
            id: 'trip-1',
            storeId: 'store-1',
            completedAt,
            sequence: ['item-b'],
          },
        ],
      },
      completedAt,
    )

    const recalculatedRows = getPlanningRows(afterTripMutation)
    expect(recalculatedRows.map((row) => row.id)).toEqual(['item-b', 'item-a'])
  })

  it('keeps learned order stable when an item is renamed', () => {
    const completedAt = Date.now() - 60 * 60 * 1000

    const withTrips = persistWeightedPositions(
      makeState([
        {
          id: 'trip-1',
          storeId: 'store-1',
          completedAt,
          sequence: ['item-a', 'item-b'],
        },
      ]),
      completedAt,
    )

    const renamedState: AppState = {
      ...withTrips,
      items: withTrips.items.map((item) =>
        item.id === 'item-a' ? { ...item, name: 'Havremelk' } : item,
      ),
    }

    const rows = getPlanningRows(renamedState)

    expect(rows.map((row) => row.id)).toEqual(['item-a', 'item-b'])
    expect(rows[0]?.name).toBe('Havremelk')
  })

  it('only shows list items for the selected store', () => {
    const mixedState: AppState = {
      ...makeState([]),
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
      selectedStoreId: 'store-2',
      list: [
        ...makeList(),
        {
          itemId: 'item-a',
          storeId: 'store-2',
          quantity: 3,
          addedAt: 3,
          weightedPosition: 0.2,
        },
      ],
    }

    const rows = getPlanningRows(mixedState)

    expect(rows).toEqual([
      {
        id: 'item-a',
        name: 'A',
        qty: 3,
      },
    ])
  })
})
