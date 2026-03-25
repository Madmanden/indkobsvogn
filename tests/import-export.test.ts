import { describe, expect, it } from 'vitest'
import type { AppState } from '../src/domain/models'
import {
  formatStateExport,
  mergeImportedState,
  parseStateImport,
} from '../src/utils/importExport'

function makeState(): AppState {
  return {
    stores: [
      {
        id: 'store-a',
        name: 'Butik A',
        subtitle: '1 tur',
        icon: '🛒',
        createdAt: 1,
      },
    ],
    selectedStoreId: 'store-a',
    items: [
      {
        id: 'item-a',
        name: 'Mælk',
        defaultQuantity: 1,
        createdAt: 1,
        lastUsedAt: 1,
      },
    ],
    list: [
      {
        itemId: 'item-a',
        storeId: 'store-a',
        quantity: 1,
        addedAt: 1,
        weightedPosition: 1,
      },
    ],
    trips: [
      {
        id: 'trip-a',
        storeId: 'store-a',
        completedAt: 10,
        sequence: ['item-a'],
      },
    ],
    isShopping: false,
    currentSequence: [],
  }
}

describe('import/export', () => {
  it('formats and parses valid app state json', () => {
    const state = makeState()
    const exported = formatStateExport(state)
    const parsed = parseStateImport(exported)

    expect(parsed).not.toBeNull()
    expect(parsed?.selectedStoreId).toBe('store-a')
  })

  it('returns null for invalid import payloads', () => {
    expect(parseStateImport('{invalid')).toBeNull()
    expect(parseStateImport('{"foo":1}')).toBeNull()
  })

  it('migrates legacy imports that do not yet include storeId on list items and trips', () => {
    const legacyPayload = JSON.stringify({
      stores: makeState().stores,
      selectedStoreId: 'store-a',
      items: makeState().items,
      list: [
        {
          itemId: 'item-a',
          quantity: 1,
          addedAt: 1,
          weightedPosition: 1,
        },
      ],
      trips: [
        {
          id: 'trip-a',
          completedAt: 10,
          sequence: ['item-a'],
        },
      ],
      isShopping: false,
      currentSequence: [],
    })

    const parsed = parseStateImport(legacyPayload)

    expect(parsed?.list[0]?.storeId).toBe('store-a')
    expect(parsed?.trips[0]?.storeId).toBe('store-a')
  })

  it('merges imported state using union for stores/items/trips and list entries', () => {
    const current = makeState()

    const imported: AppState = {
      stores: [
        ...current.stores,
        {
          id: 'store-b',
          name: 'Butik B',
          subtitle: '0 ture',
          icon: '🟡',
          createdAt: 2,
        },
      ],
      selectedStoreId: 'store-b',
      items: [
        ...current.items,
        {
          id: 'item-b',
          name: 'Brød',
          defaultQuantity: 2,
          createdAt: 2,
          lastUsedAt: 2,
        },
      ],
      list: [
        {
          itemId: 'item-b',
          storeId: 'store-b',
          quantity: 2,
          addedAt: 2,
          weightedPosition: 1,
        },
      ],
      trips: [
        ...current.trips,
        {
          id: 'trip-b',
          storeId: 'store-b',
          completedAt: 11,
          sequence: ['item-b'],
        },
      ],
      isShopping: true,
      currentSequence: ['item-b'],
    }

    const merged = mergeImportedState(current, imported)

    expect(merged.stores.map((store) => store.id)).toEqual(['store-a', 'store-b'])
    expect(merged.items.map((item) => item.id)).toEqual(['item-a', 'item-b'])
    expect(merged.trips.map((trip) => trip.id)).toEqual(['trip-a', 'trip-b'])
    expect(merged.list.map((item) => `${item.storeId}:${item.itemId}`)).toEqual(['store-a:item-a', 'store-b:item-b'])
    expect(merged.selectedStoreId).toBe('store-b')
    expect(merged.isShopping).toBe(false)
    expect(merged.currentSequence).toEqual([])
  })

  it('prefers imported list values when the same store item exists in both states', () => {
    const current = makeState()

    const imported: AppState = {
      ...current,
      list: [
        {
          itemId: 'item-a',
          storeId: 'store-a',
          quantity: 4,
          addedAt: 9,
          weightedPosition: 3,
        },
      ],
    }

    const merged = mergeImportedState(current, imported)

    expect(merged.list).toEqual([
      {
        itemId: 'item-a',
        storeId: 'store-a',
        quantity: 4,
        addedAt: 9,
        weightedPosition: 3,
      },
    ])
  })
})
