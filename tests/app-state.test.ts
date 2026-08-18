import { describe, expect, it } from 'vitest'
import {
  cancelTrip,
  completeTrip,
  persistWeightedPositions,
  reorderList,
  startTrip,
} from '../src/domain/app-state'
import { UNLEARNED_POSITION } from '../src/domain/learning'
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
    ],
    trips,
    isShopping: true,
    currentSequence: ['item-a', 'item-b'],
    sortMode: 'learned',
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

    expect(persisted.list[0]?.weightedPosition).toBe(0)
    expect(persisted.list[1]?.weightedPosition).toBe(1)
  })
})

describe('reorderList', () => {
  it('assigns manual positions for the selected store following the given order', () => {
    const state = { ...makeState(), isShopping: false, currentSequence: [] }

    const reordered = reorderList(state, ['item-b', 'item-a'])

    expect(reordered.sortMode).toBe('manual')
    expect(reordered.list.find((entry) => entry.itemId === 'item-b')?.manualPosition).toBe(0)
    expect(reordered.list.find((entry) => entry.itemId === 'item-a')?.manualPosition).toBe(1)
  })

  it('clears stale manual positions for selected-store items omitted from the order', () => {
    const state = {
      ...makeState(),
      isShopping: false,
      currentSequence: [],
    }
    const withManual = reorderList(state, ['item-b', 'item-a'])

    const reordered = reorderList(withManual, ['item-a'])

    expect(reordered.list.find((entry) => entry.itemId === 'item-a')?.manualPosition).toBe(0)
    expect(reordered.list.find((entry) => entry.itemId === 'item-b')?.manualPosition).toBe(-1)
  })

  it('leaves list items for other stores untouched', () => {
    const otherStoreItem = {
      itemId: 'item-a',
      storeId: 'store-2',
      quantity: 1,
      addedAt: 3,
      weightedPosition: UNLEARNED_POSITION,
      manualPosition: -1,
    }
    const state = {
      ...makeState(),
      isShopping: false,
      currentSequence: [],
      list: [...makeState().list, otherStoreItem],
    }

    const reordered = reorderList(state, ['item-b', 'item-a'])

    expect(reordered.list.find((entry) => entry.storeId === 'store-2')).toEqual(otherStoreItem)
  })
})

describe('startTrip', () => {
  it('starts shopping without recording a trip when no manual order exists', () => {
    const state = { ...makeState(), isShopping: false, currentSequence: ['stale'] }

    const started = startTrip(state, 1000)

    expect(started.isShopping).toBe(true)
    expect(started.currentSequence).toEqual([])
    expect(started.trips).toHaveLength(0)
    expect(started.sortMode).toBe('learned')
    expect(started.list).toEqual(state.list)
  })

  it('records the manual order as a trip so future sortings learn from it', () => {
    const state = reorderList(
      { ...makeState(), isShopping: false, currentSequence: [] },
      ['item-b', 'item-a'],
    )

    const started = startTrip(state, 1000)

    expect(started.isShopping).toBe(true)
    expect(started.trips).toHaveLength(1)
    expect(started.sortMode).toBe('learned')
    expect(started.trips[0]?.storeId).toBe('store-1')
    expect(started.trips[0]?.completedAt).toBe(1000)
    expect(started.trips[0]?.sequence).toEqual(['item-b', 'item-a'])
    expect(started.list.every((entry) => entry.manualPosition === -1)).toBe(true)
    expect(started.list.find((entry) => entry.itemId === 'item-b')?.weightedPosition).toBe(0)
    expect(started.list.find((entry) => entry.itemId === 'item-a')?.weightedPosition).toBe(1)
  })

  it('only records items for the selected store in the manual-order trip', () => {
    const state = reorderList(
      {
        ...makeState(),
        isShopping: false,
        currentSequence: [],
        list: [
          ...makeState().list,
          {
            itemId: 'item-c',
            storeId: 'store-2',
            quantity: 1,
            addedAt: 3,
            weightedPosition: UNLEARNED_POSITION,
            manualPosition: -1,
          },
        ],
      },
      ['item-b', 'item-a'],
    )

    const started = startTrip(state, 1000)

    expect(started.trips[0]?.sequence).toEqual(['item-b', 'item-a'])
    expect(started.list.find((entry) => entry.itemId === 'item-c')?.weightedPosition).toBe(
      UNLEARNED_POSITION,
    )
    expect(started.list.find((entry) => entry.itemId === 'item-c')?.manualPosition).toBe(-1)
  })
})

describe('cancelTrip', () => {
  it('resets isShopping and currentSequence without touching the list or trips', () => {
    const state = makeState([
      { id: 'trip-1', storeId: 'store-1', completedAt: 1000, sequence: ['item-a'] },
    ])
    const cancelled = cancelTrip(state)

    expect(cancelled.isShopping).toBe(false)
    expect(cancelled.currentSequence).toEqual([])
    expect(cancelled.list).toEqual(state.list)
    expect(cancelled.trips).toEqual(state.trips)
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
          weightedPosition: UNLEARNED_POSITION,
          manualPosition: -1,
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

  it('clears manual positions on all remaining list items after completion', () => {
    const state = reorderList(
      {
        ...makeState(),
        selectedStoreId: 'store-1',
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
            weightedPosition: UNLEARNED_POSITION,
            manualPosition: 4,
          },
        ],
        isShopping: true,
      },
      ['item-b', 'item-a'],
    )

    const completed = completeTrip(state, 1000)

    expect(completed.sortMode).toBe('learned')
    expect(completed.list.every((entry) => entry.manualPosition === -1)).toBe(true)
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

    const persisted = persistWeightedPositions(state, 1000)

    expect(
      persisted.list.find((item) => item.itemId === 'item-a' && item.storeId === 'store-1')
        ?.weightedPosition,
    ).toBe(0)
    expect(
      persisted.list.find((item) => item.itemId === 'item-a' && item.storeId === 'store-2')
        ?.weightedPosition,
    ).toBe(1)
  })
})
