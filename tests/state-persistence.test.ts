import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../src/domain/models'
import { persistAppState } from '../src/hooks/state-persistence'

const { saveStateMock } = vi.hoisted(() => ({
  saveStateMock: vi.fn(),
}))

vi.mock('../src/domain/store', () => ({
  appStore: {
    saveState: saveStateMock,
  },
}))

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
    const error = new Error('Quota exceeded')
    error.name = 'QuotaExceededError'
    saveStateMock.mockImplementation(() => {
      throw error
    })

    expect(persistAppState(makeState())).toBe(false)
    expect(saveStateMock).toHaveBeenCalledTimes(1)
  })

  it('rethrows unexpected persistence errors', () => {
    saveStateMock.mockImplementation(() => {
      throw new Error('boom')
    })

    expect(() => persistAppState(makeState())).toThrow('boom')
  })
})
