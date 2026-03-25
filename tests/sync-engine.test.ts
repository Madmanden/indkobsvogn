import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../src/domain/models'

vi.mock('../src/api/client', () => {
  const fetchStateMock = vi.fn()
  const pushStateMock = vi.fn()

  ;(globalThis as typeof globalThis & {
    __syncMocks?: { fetchStateMock: typeof fetchStateMock; pushStateMock: typeof pushStateMock }
  }).__syncMocks = { fetchStateMock, pushStateMock }

  return {
    fetchState: fetchStateMock,
    pushState: pushStateMock,
    toSyncableState: (state: AppState) => {
      const { selectedStoreId, isShopping, currentSequence, list, ...syncable } = state
      void selectedStoreId
      void isShopping
      void currentSequence
      void list
      return syncable
    },
    mergeServerStateIntoLocal: (localState: AppState, serverState: Partial<AppState>) => {
      const serverStores = Array.isArray(serverState.stores) ? serverState.stores : []
      const stores = serverStores.length > 0 ? serverStores : localState.stores
      const selectedStoreId = stores.some((s: { id: string }) => s.id === localState.selectedStoreId)
        ? localState.selectedStoreId
        : stores[0]?.id ?? ''

      return {
        ...localState,
        ...serverState,
        list: localState.list,
        selectedStoreId,
        isShopping: localState.isShopping,
        currentSequence: localState.currentSequence,
      }
    },
  }
})

function getMocks() {
  const mocks = (globalThis as typeof globalThis & {
    __syncMocks?: { fetchStateMock: ReturnType<typeof vi.fn>; pushStateMock: ReturnType<typeof vi.fn> }
  }).__syncMocks

  if (!mocks) {
    throw new Error('sync mocks were not initialized')
  }

  return mocks
}

async function tick(ms: number) {
  vi.advanceTimersByTime(ms)
  await Promise.resolve()
}

async function flushAsyncWork(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

function createMemoryStorage() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function makeState(): AppState {
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
        addedAt: 0,
        weightedPosition: 1,
      },
    ],
    trips: [],
    isShopping: false,
    currentSequence: [],
  }
}

async function loadModules() {
  vi.useFakeTimers()
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: vi.fn(),
    },
    configurable: true,
    writable: true,
  })

  const engine = await import('../src/sync/engine')
  const client = await import('../src/api/client')
  const { fetchStateMock, pushStateMock } = getMocks()

  fetchStateMock.mockReset()
  pushStateMock.mockReset()
  engine.resetSyncEngine()

  return { engine, client }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('sync engine', () => {
  it('debounces pushes until the trailing edge', async () => {
    const { engine } = await loadModules()
    const { fetchStateMock, pushStateMock } = getMocks()
    const state = makeState()

    pushStateMock.mockResolvedValue({
      ok: true,
      state: {
        stores: state.stores,
        items: state.items,
        trips: state.trips,
      },
      version: 2,
    })
    fetchStateMock.mockResolvedValue({
      state: {
        stores: state.stores,
        items: state.items,
        trips: state.trips,
      },
      version: 1,
    })

    engine.registerSyncHandlers({
      applyRemoteState: vi.fn(),
      onStatusChange: vi.fn(),
    })

    engine.notifyStateChanged(state)

    await tick(1999)
    expect(pushStateMock).not.toHaveBeenCalled()

    await tick(1)
    expect(pushStateMock).toHaveBeenCalledTimes(1)
  })

  it('applies the server returned state after a successful flush', async () => {
    const { engine } = await loadModules()
    const { pushStateMock } = getMocks()
    const state = makeState()
    const applyRemoteState = vi.fn()

    pushStateMock.mockResolvedValue({
      ok: true,
      state: {
        stores: state.stores,
        items: [
          {
            id: 'item-a',
            name: 'Mælk fra serveren',
            defaultQuantity: 2,
            createdAt: 0,
            lastUsedAt: 0,
          },
        ],
        trips: state.trips,
      },
      version: 2,
    })

    engine.registerSyncHandlers({
      applyRemoteState,
      onStatusChange: vi.fn(),
    })

    engine.notifyStateChanged(state)

    await tick(2000)

    expect(applyRemoteState).toHaveBeenCalledTimes(1)
    expect(applyRemoteState).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'item-a',
            name: 'Mælk fra serveren',
            defaultQuantity: 2,
          }),
        ],
        list: state.list,
      }),
      2,
    )
  })

  it('keeps local edits when the same item changed on another device', async () => {
    const { engine } = await loadModules()
    const { pushStateMock } = getMocks()
    const state = makeState()
    const onStatusChange = vi.fn()
    const onConflict = vi.fn()

    pushStateMock
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        state: {
          stores: state.stores,
          items: [
            {
              id: 'item-a',
              name: 'Mælk',
              defaultQuantity: 2,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 3,
      })
      .mockResolvedValueOnce({
        ok: true,
        state: {
          stores: state.stores,
          items: [
            {
              id: 'item-a',
              name: 'Mælk',
              defaultQuantity: 1,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 4,
      })

    engine.registerSyncHandlers({
      applyRemoteState: vi.fn(),
      onConflict,
      onStatusChange,
    })

    engine.notifyStateChanged(state)

    await tick(2000)
    await tick(1500)

    expect(onConflict).not.toHaveBeenCalled()
    expect(pushStateMock).toHaveBeenCalledTimes(2)
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        retryingConflict: true,
      }),
    )
  })

  it('keeps retrying conflicts in the background after automatic retries are exhausted', async () => {
    const { engine } = await loadModules()
    const { pushStateMock } = getMocks()
    const state = makeState()
    const applyRemoteState = vi.fn()
    const onConflict = vi.fn()
    const onStatusChange = vi.fn()

    pushStateMock
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        state: {
          stores: state.stores,
          items: [
            {
              id: 'item-a',
              name: 'Mælk fra anden enhed',
              defaultQuantity: 2,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 3,
      })
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        state: {
          stores: state.stores,
          items: [
            {
              id: 'item-a',
              name: 'Mælk fra server 1',
              defaultQuantity: 2,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 4,
      })
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        state: {
          stores: state.stores,
          items: [
            {
              id: 'item-a',
              name: 'Mælk fra server 2',
              defaultQuantity: 2,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 5,
      })
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        state: {
          stores: state.stores,
          items: [
            {
              id: 'item-a',
              name: 'Mælk fra server 3',
              defaultQuantity: 2,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 6,
      })

    engine.registerSyncHandlers({
      applyRemoteState,
      onConflict,
      onStatusChange,
    })

    engine.notifyStateChanged(state)

    await tick(2000)
    await tick(1500)
    await flushAsyncWork()

    expect(pushStateMock).toHaveBeenCalledTimes(4)
    expect(applyRemoteState).not.toHaveBeenCalled()
    expect(onConflict).not.toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        retryingConflict: true,
        syncing: false,
        pending: true,
      }),
    )
  })

  it('applies the server returned state after keep-mine succeeds', async () => {
    const { engine } = await loadModules()
    const state = makeState()
    const applyRemoteState = vi.fn()
    const { pushStateMock } = getMocks()

    pushStateMock.mockResolvedValue({
      ok: true,
      state: {
        stores: state.stores,
        items: [
          {
            id: 'item-a',
            name: 'Mælk bekraeftet',
            defaultQuantity: 3,
            createdAt: 0,
            lastUsedAt: 0,
          },
        ],
        trips: state.trips,
      },
      version: 9,
    })

    const conflict = {
      localState: state,
      serverState: {
        stores: state.stores,
        items: [],
        trips: [],
      },
      serverVersion: 8,
    }

    engine.registerSyncHandlers({
      applyRemoteState,
      onStatusChange: vi.fn(),
    })

    const result = await engine.resolveConflictKeepMine(conflict)

    expect(result).toBeNull()
    expect(applyRemoteState).toHaveBeenCalledTimes(1)
    expect(applyRemoteState).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'item-a',
            name: 'Mælk bekraeftet',
            defaultQuantity: 3,
          }),
        ],
        list: state.list,
      }),
      9,
    )
  })

  it('merges non-overlapping changes in the background without opening the conflict dialog', async () => {
    const { engine } = await loadModules()
    const { pushStateMock } = getMocks()
    const state = makeState()
    const applyRemoteState = vi.fn()
    const onConflict = vi.fn()

    pushStateMock
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        state: {
          stores: state.stores,
          items: [
            ...state.items,
            {
              id: 'item-b',
              name: 'Smør',
              defaultQuantity: 1,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 3,
      })
      .mockResolvedValueOnce({
        ok: true,
        state: {
          stores: [
            ...state.stores,
            {
              id: 'store-2',
              name: 'Ekstra butik',
              subtitle: '0 ture',
              icon: '🛒',
              createdAt: 2,
            },
          ],
          items: [
            ...state.items,
            {
              id: 'item-b',
              name: 'Smør',
              defaultQuantity: 1,
              createdAt: 0,
              lastUsedAt: 0,
            },
          ],
          trips: state.trips,
        },
        version: 4,
      })

    engine.registerSyncHandlers({
      applyRemoteState,
      onConflict,
      onStatusChange: vi.fn(),
    })

    engine.notifyStateChanged(state)

    await tick(2000)
    await tick(1500)

    expect(onConflict).not.toHaveBeenCalled()
    expect(pushStateMock).toHaveBeenCalledTimes(2)
    expect(applyRemoteState).toHaveBeenCalledTimes(1)
    expect(applyRemoteState).toHaveBeenCalledWith(
      expect.objectContaining({
        stores: expect.arrayContaining([
          expect.objectContaining({ id: 'store-2' }),
        ]),
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'item-a' }),
          expect.objectContaining({ id: 'item-b' }),
        ]),
      }),
      4,
    )
  })

  it('waits for the initial hydrate before flushing local edits', async () => {
    const { engine } = await loadModules()
    const { fetchStateMock, pushStateMock } = getMocks()
    const state = makeState()
    const remoteState = {
      stores: state.stores,
      items: [],
      trips: [],
    }
    const hydrate = createDeferred<{
      state: typeof remoteState
      version: number
    }>()

    fetchStateMock.mockReturnValueOnce(hydrate.promise)
    pushStateMock.mockResolvedValue({
      ok: true,
      state: remoteState,
      version: 8,
    })

    engine.registerSyncHandlers({
      applyRemoteState: vi.fn(),
      onStatusChange: vi.fn(),
    })

    engine.initializeSync(state)
    engine.notifyStateChanged(state)

    await tick(2000)
    expect(pushStateMock).not.toHaveBeenCalled()

    hydrate.resolve({
      state: remoteState,
      version: 7,
    })
    await flushAsyncWork()

    expect(pushStateMock).toHaveBeenCalledTimes(1)
    expect(pushStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stores: state.stores,
        items: state.items,
        trips: state.trips,
      }),
      7,
    )
  })

  it('quietly accepts the server version when the syncable states are identical', async () => {
    const { engine } = await loadModules()
    const { pushStateMock } = getMocks()
    const state = makeState()
    const applyRemoteState = vi.fn()
    const onConflict = vi.fn()
    const onStatusChange = vi.fn()

    pushStateMock.mockResolvedValue({
      ok: false,
      conflict: true,
      state: {
        stores: state.stores,
        items: state.items,
        trips: state.trips,
      },
      version: 4,
    })

    engine.registerSyncHandlers({
      applyRemoteState,
      onConflict,
      onStatusChange,
    })

    engine.notifyStateChanged(state)

    await tick(2000)

    expect(pushStateMock).toHaveBeenCalledTimes(1)
    expect(onConflict).not.toHaveBeenCalled()
    expect(applyRemoteState).not.toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        retryingConflict: false,
        pending: false,
      }),
    )
  })

  it('quietly accepts the server version when the local syncable state is empty', async () => {
    const { engine } = await loadModules()
    const { pushStateMock } = getMocks()
    const emptyState: AppState = {
      stores: [],
      selectedStoreId: '',
      items: [],
      list: [],
      trips: [],
      isShopping: false,
      currentSequence: [],
    }
    const applyRemoteState = vi.fn()
    const onConflict = vi.fn()
    const onStatusChange = vi.fn()

    pushStateMock.mockResolvedValue({
      ok: false,
      conflict: true,
      state: {
        stores: [
          {
            id: 'store-1',
            name: 'Store',
            subtitle: '0 ture',
            icon: '🛒',
            createdAt: 0,
          },
        ],
        items: [],
        trips: [],
      },
      version: 5,
    })

    engine.registerSyncHandlers({
      applyRemoteState,
      onConflict,
      onStatusChange,
    })

    engine.notifyStateChanged(emptyState)

    await tick(2000)

    expect(pushStateMock).toHaveBeenCalledTimes(1)
    expect(onConflict).not.toHaveBeenCalled()
    expect(applyRemoteState).not.toHaveBeenCalled()
    expect(pushStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stores: [],
      }),
      0,
    )
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        retryingConflict: false,
        pending: false,
      }),
    )
  })

  it('prefers the local phone state when hydration finds a newer server version', async () => {
    const { engine } = await loadModules()
    const { fetchStateMock, pushStateMock } = getMocks()
    const state = makeState()
    const applyRemoteState = vi.fn()

    fetchStateMock.mockResolvedValue({
      state: {
        stores: state.stores,
        items: [],
        trips: [],
      },
      version: 7,
    })
    pushStateMock.mockResolvedValue({
      ok: true,
      state: {
        stores: state.stores,
        items: state.items,
        trips: state.trips,
      },
      version: 8,
    })

    engine.registerSyncHandlers({
      applyRemoteState,
      onStatusChange: vi.fn(),
    })

    engine.initializeSync(state)
    await flushAsyncWork()

    expect(pushStateMock).toHaveBeenCalledTimes(1)
    expect(pushStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stores: state.stores,
        items: state.items,
        trips: state.trips,
      }),
      7,
    )
    expect(applyRemoteState).toHaveBeenCalledWith(
      expect.objectContaining({
        items: state.items,
        list: state.list,
      }),
      8,
    )
  })

  it('keeps local-only fields when merging server state', async () => {
    const { client } = await loadModules()
    const local = {
      ...makeState(),
      selectedStoreId: 'store-1',
      isShopping: true,
      currentSequence: ['item-a'],
    }

    const merged = client.mergeServerStateIntoLocal(local, {
      stores: [],
      items: [],
      trips: [],
    })

    expect(merged.selectedStoreId).toBe('store-1')
    expect(merged.isShopping).toBe(true)
    expect(merged.currentSequence).toEqual(['item-a'])
    expect(merged.list).toEqual(local.list)
  })

  it('falls back to the first server store when the selected store was deleted remotely', async () => {
    const { client } = await loadModules()
    const local = {
      ...makeState(),
      stores: [
        ...makeState().stores,
        {
          id: 'store-2',
          name: 'Other Store',
          subtitle: '0 ture',
          icon: 'S',
          createdAt: 1,
        },
      ],
      selectedStoreId: 'store-2',
    }

    const merged = client.mergeServerStateIntoLocal(local, {
      stores: [
        {
          id: 'store-1',
          name: 'Server Store',
          subtitle: '0 ture',
          icon: 'S',
          createdAt: 1,
        },
      ],
      items: local.items,
      trips: local.trips,
    })

    expect(merged.selectedStoreId).toBe('store-1')
  })
})
