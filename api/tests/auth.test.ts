import { describe, expect, it } from 'vitest'
import { createSessionCookie } from '../src/lib/auth'

describe('session cookie', () => {
  const secureSignInUrl = 'https://example.com/api/auth/sign-in/verify'

  it('uses a lax cookie for https sign-ins', () => {
    const cookie = createSessionCookie('session_123', secureSignInUrl, Date.now() + 1000)

    expect(cookie).toContain('indkobsvogn_session=session_123')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/')
  })

  it('uses the configured cookie name when provided', () => {
    const cookie = createSessionCookie(
      'session_123',
      secureSignInUrl,
      Date.now() + 1000,
      'custom_session',
    )

    expect(cookie).toContain('custom_session=session_123')
    expect(cookie).not.toContain('indkobsvogn_session=session_123')
  })

  it('keeps lax cookies on http for local development', () => {
    const cookie = createSessionCookie('session_123', 'http://localhost:8788/api/auth/sign-in/verify', Date.now() + 1000)

    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
  })
})
