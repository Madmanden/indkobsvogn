import { beforeEach, describe, expect, it } from 'vitest'
import type { AppState } from '../src/domain/models'
import { appStore } from '../src/domain/store'
import { isQuotaExceededError } from '../src/utils/storage'

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
    items: [],
    list: [],
    trips: [],
    isShopping: false,
    currentSequence: [],
  }
}

function createMemoryStorage(shouldThrowOnSet = false) {
  const store = new Map<string, string>()

  return {
    seed(key: string, value: string) {
      store.set(key, value)
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (shouldThrowOnSet) {
        const error = new Error('Quota exceeded')
        error.name = 'QuotaExceededError'
        throw error
      }

      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  })
})

describe('storage helpers', () => {
  it('detects quota exceeded errors', () => {
    const error = new Error('Quota exceeded')
    error.name = 'QuotaExceededError'

    expect(isQuotaExceededError(error)).toBe(true)
    expect(isQuotaExceededError(new Error('other'))).toBe(false)
  })

  it('preserves the previous persisted state when a write fails', () => {
    const initialState = makeState()
    appStore.saveState(initialState, { pendingSync: false, serverVersion: null })

    const serializedBeforeFailure = localStorage.getItem(appStore.storageKey)
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(true),
      configurable: true,
      writable: true,
    })
    ;(localStorage as ReturnType<typeof createMemoryStorage>).seed(appStore.storageKey, serializedBeforeFailure ?? '')

    expect(() =>
      appStore.saveState({
        ...initialState,
        stores: [
          ...initialState.stores,
          {
            id: 'store-b',
            name: 'Butik B',
            subtitle: '0 ture',
            icon: 'B',
            createdAt: 2,
          },
        ],
      }),
    ).toThrowError(/Quota exceeded/)

    expect(appStore.getState()).toEqual(initialState)
  })

  it('replaces household sync metadata when a different household is loaded', () => {
    const initialState = makeState()
    appStore.saveState(initialState, {
      pendingSync: false,
      serverVersion: 5,
      householdId: 'household-a',
    })

    appStore.saveState(
      {
        ...initialState,
        stores: [
          {
            id: 'store-b',
            name: 'Butik B',
            subtitle: '0 ture',
            icon: 'B',
            createdAt: 2,
          },
        ],
        selectedStoreId: 'store-b',
      },
      {
        pendingSync: false,
        serverVersion: 1,
        householdId: 'household-b',
      },
    )

    expect(appStore.getSyncMeta()).toEqual({
      pendingSync: false,
      serverVersion: 1,
      householdId: 'household-b',
    })
  })
})
