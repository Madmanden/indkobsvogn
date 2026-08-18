import { describe, expect, it } from 'vitest'
import {
  getLearnedPosition,
  recalculateWeightedPositions,
  UNLEARNED_POSITION,
} from '../src/domain/learning'
import type { AppState, ListItem, Trip } from '../src/domain/models'
import { compareListItems, getPlanningRows } from '../src/utils/list'

function makeList(): ListItem[] {
  return [
    {
      itemId: 'item-a',
      storeId: 'store-1',
      quantity: 1,
      addedAt: 1,
      weightedPosition: UNLEARNED_POSITION,
      manualPosition: -1,
    },
    {
      itemId: 'item-b',
      storeId: 'store-1',
      quantity: 1,
      addedAt: 2,
      weightedPosition: UNLEARNED_POSITION,
      manualPosition: -1,
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
    sortMode: 'learned',
  }
}

describe('getLearnedPosition', () => {
  it('returns the explicit unlearned position without comparative evidence', () => {
    expect(getLearnedPosition('item-a', [], 100)).toBe(UNLEARNED_POSITION)
    expect(
      getLearnedPosition(
        'item-a',
        [{ id: 'single', storeId: 'store-1', completedAt: 100, sequence: ['item-a'] }],
        100,
      ),
    ).toBe(UNLEARNED_POSITION)
  })

  it('learns pairwise order from a two-item trip', () => {
    const trips: Trip[] = [
      { id: 'trip-1', storeId: 'store-1', completedAt: 100, sequence: ['item-a', 'item-b'] },
    ]

    expect(getLearnedPosition('item-a', trips, 100)).toBe(0)
    expect(getLearnedPosition('item-b', trips, 100)).toBe(1)
  })

  it('maps a three-item route to early, middle and late comparative positions', () => {
    const trips: Trip[] = [
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: 100,
        sequence: ['item-a', 'item-b', 'item-c'],
      },
    ]

    expect(getLearnedPosition('item-a', trips, 100)).toBe(0)
    expect(getLearnedPosition('item-b', trips, 100)).toBe(0.5)
    expect(getLearnedPosition('item-c', trips, 100)).toBe(1)
  })

  it('does not let a newer single-item errand move an established route position', () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const trips: Trip[] = [
      {
        id: 'route',
        storeId: 'store-1',
        completedAt: now - 1000,
        sequence: ['item-a', 'item-b', 'item-c'],
      },
      {
        id: 'errand',
        storeId: 'store-1',
        completedAt: now,
        sequence: ['item-c'],
      },
    ]

    expect(getLearnedPosition('item-c', trips, now)).toBe(1)
  })

  it('weights recent contradictory route evidence more heavily', () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const day = 24 * 60 * 60 * 1000
    const trips: Trip[] = [
      {
        id: 'old',
        storeId: 'store-1',
        completedAt: now - 9 * day,
        sequence: ['item-b', 'item-a'],
      },
      {
        id: 'new',
        storeId: 'store-1',
        completedAt: now - day,
        sequence: ['item-a', 'item-b'],
      },
    ]

    expect(getLearnedPosition('item-a', trips, now, 0.2)).toBeLessThan(
      getLearnedPosition('item-b', trips, now, 0.2),
    )
  })
})

describe('recalculateWeightedPositions', () => {
  it('keeps unseen items below a genuinely learned last item', () => {
    const list = [
      ...makeList(),
      {
        itemId: 'item-c',
        storeId: 'store-1',
        quantity: 1,
        addedAt: 3,
        weightedPosition: UNLEARNED_POSITION,
        manualPosition: -1,
      },
    ]
    const trips: Trip[] = [
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: 100,
        sequence: ['item-a', 'item-b'],
      },
    ]

    const weighted = recalculateWeightedPositions(list, trips, 100)

    expect(weighted.find((item) => item.itemId === 'item-b')?.weightedPosition).toBe(1)
    expect(weighted.find((item) => item.itemId === 'item-c')?.weightedPosition).toBe(
      UNLEARNED_POSITION,
    )
  })
})

describe('compareListItems', () => {
  it('sorts by learned position then addedAt without manual positions', () => {
    expect(
      compareListItems(
        { weightedPosition: 0.2, addedAt: 5, manualPosition: -1 },
        { weightedPosition: 0.8, addedAt: 1, manualPosition: -1 },
      ),
    ).toBeLessThan(0)
    expect(
      compareListItems(
        { weightedPosition: 0.5, addedAt: 2, manualPosition: -1 },
        { weightedPosition: 0.5, addedAt: 1, manualPosition: -1 },
      ),
    ).toBeGreaterThan(0)
  })

  it('prioritizes manual positions over learned positions', () => {
    expect(
      compareListItems(
        { weightedPosition: UNLEARNED_POSITION, addedAt: 9, manualPosition: 0 },
        { weightedPosition: 0, addedAt: 1, manualPosition: -1 },
      ),
    ).toBeLessThan(0)
  })
})

describe('getPlanningRows', () => {
  it('derives ordering from current trip history instead of stale cached weights', () => {
    const now = Date.now()
    const state = makeState([
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: now,
        sequence: ['item-a', 'item-b'],
      },
    ])

    expect(getPlanningRows(state).map((row) => row.id)).toEqual(['item-a', 'item-b'])

    const withRemoteHistory: AppState = {
      ...state,
      trips: [
        {
          id: 'trip-2',
          storeId: 'store-1',
          completedAt: now,
          sequence: ['item-b', 'item-a'],
        },
      ],
    }

    expect(getPlanningRows(withRemoteHistory).map((row) => row.id)).toEqual(['item-b', 'item-a'])
  })

  it('marks a learned last item as learned and sorts it before an unseen item', () => {
    const now = Date.now()
    const state: AppState = {
      ...makeState([
        {
          id: 'trip-1',
          storeId: 'store-1',
          completedAt: now,
          sequence: ['item-a', 'item-b'],
        },
      ]),
      items: [
        ...makeState([]).items,
        {
          id: 'item-c',
          name: 'C',
          defaultQuantity: 1,
          createdAt: 0,
          lastUsedAt: 0,
        },
      ],
      list: [
        ...makeList(),
        {
          itemId: 'item-c',
          storeId: 'store-1',
          quantity: 1,
          addedAt: 3,
          weightedPosition: 0,
          manualPosition: -1,
        },
      ],
    }

    const rows = getPlanningRows(state)

    expect(rows.map((row) => row.id)).toEqual(['item-a', 'item-b', 'item-c'])
    expect(rows.find((row) => row.id === 'item-b')?.hasLearnedPosition).toBe(true)
    expect(rows.find((row) => row.id === 'item-c')?.hasLearnedPosition).toBe(false)
  })

  it('keeps learned order stable when an item is renamed', () => {
    const now = Date.now()
    const state = makeState([
      {
        id: 'trip-1',
        storeId: 'store-1',
        completedAt: now,
        sequence: ['item-a', 'item-b'],
      },
    ])
    const renamed: AppState = {
      ...state,
      items: state.items.map((item) =>
        item.id === 'item-a' ? { ...item, name: 'Havremelk' } : item,
      ),
    }

    const rows = getPlanningRows(renamed)
    expect(rows.map((row) => row.id)).toEqual(['item-a', 'item-b'])
    expect(rows[0]?.name).toBe('Havremelk')
  })

  it('isolates learning and list rows by selected store', () => {
    const now = Date.now()
    const state: AppState = {
      ...makeState([
        {
          id: 'store-1-trip',
          storeId: 'store-1',
          completedAt: now,
          sequence: ['item-a', 'item-b'],
        },
        {
          id: 'store-2-trip',
          storeId: 'store-2',
          completedAt: now,
          sequence: ['item-b', 'item-a'],
        },
      ]),
      stores: [
        ...makeState([]).stores,
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
          quantity: 1,
          addedAt: 3,
          weightedPosition: UNLEARNED_POSITION,
          manualPosition: -1,
        },
        {
          itemId: 'item-b',
          storeId: 'store-2',
          quantity: 1,
          addedAt: 4,
          weightedPosition: UNLEARNED_POSITION,
          manualPosition: -1,
        },
      ],
    }

    expect(getPlanningRows(state).map((row) => row.id)).toEqual(['item-b', 'item-a'])
  })
})
