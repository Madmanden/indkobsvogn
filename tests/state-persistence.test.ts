import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../src/domain/models'
import { persistAppState } from '../src/hooks/state-persistence'

vi.mock('../src/domain/store', () => {
  const saveStateMock = vi.fn()

  ;(globalThis as typeof globalThis & {
    __statePersistenceMocks?: { saveStateMock: typeof saveStateMock }
  }).__statePersistenceMocks = { saveStateMock }

  return {
    appStore: {
      saveState: saveStateMock,
    },
  }
})

function getMocks() {
  const mocks = (globalThis as typeof globalThis & {
    __statePersistenceMocks?: { saveStateMock: ReturnType<typeof vi.fn> }
  }).__statePersistenceMocks

  if (!mocks) {
    throw new Error('state persistence mocks were not initialized')
  }

  return mocks
}

function makeState(): AppState {
  return {
    stores: [],
    selectedStoreId: '',
    items: [],
    list: [],
    trips: [],
    isShopping: false,
    currentSequence: [],
  }
}

describe('persistAppState', () => {
  it('returns false when localStorage is full', () => {
    const { saveStateMock } = getMocks()
    const error = new Error('Quota exceeded')
    error.name = 'QuotaExceededError'
    saveStateMock.mockImplementation(() => {
      throw error
    })

    expect(persistAppState(makeState())).toBe(false)
    expect(saveStateMock).toHaveBeenCalledTimes(1)
  })

  it('rethrows unexpected persistence errors', () => {
    const { saveStateMock } = getMocks()
    saveStateMock.mockImplementation(() => {
      throw new Error('boom')
    })

    expect(() => persistAppState(makeState())).toThrow('boom')
  })
})
