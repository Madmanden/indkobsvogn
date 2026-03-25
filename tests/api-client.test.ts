import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('api client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
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
