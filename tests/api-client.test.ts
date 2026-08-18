import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState, SyncableState } from '../src/domain/models'
import { mergeServerStateIntoLocal, toSyncableState } from '../src/api/client'

function makeState(): AppState {
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
    selectedStoreId: 'store-1',
    items: [
      {
        id: 'item-a',
        name: 'Mælk',
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
        weightedPosition: 0.5,
        manualPosition: 0,
      },
    ],
    trips: [],
    isShopping: true,
    currentSequence: ['item-a'],
    sortMode: 'manual',
  }
}

describe('api client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('syncs only durable household state', () => {
    const state = makeState()

    expect(toSyncableState(state)).toEqual({
      stores: state.stores,
      items: state.items,
      trips: state.trips,
    })
    expect(toSyncableState(state)).not.toHaveProperty('sortMode')
    expect(toSyncableState(state)).not.toHaveProperty('list')
  })

  it('preserves device-local shopping and manual-order state when remote history arrives', () => {
    const local = makeState()
    const remote: SyncableState = {
      stores: local.stores,
      items: local.items,
      trips: [
        {
          id: 'remote-trip',
          storeId: 'store-1',
          completedAt: 100,
          sequence: ['item-a'],
        },
      ],
    }

    const merged = mergeServerStateIntoLocal(local, remote)

    expect(merged.trips).toEqual(remote.trips)
    expect(merged.list).toEqual(local.list)
    expect(merged.selectedStoreId).toBe(local.selectedStoreId)
    expect(merged.isShopping).toBe(true)
    expect(merged.currentSequence).toEqual(['item-a'])
    expect(merged.sortMode).toBe('manual')
  })

  it('times out hung household session requests instead of waiting forever', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn((_: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
      ),
      configurable: true,
      writable: true,
    })

    const { getHouseholdMe } = await import('../src/api/client')
    const request = getHouseholdMe()

    vi.advanceTimersByTime(10_000)
    await Promise.resolve()

    await expect(request).rejects.toThrowError('request_timeout:/api/household/me')
  })
})
