import type { Context } from 'hono'

export function jsonError(c: Context, status: number, error: string, extra: Record<string, unknown> = {}) {
  return c.json({ error, ...extra }, status as never)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function getBaseUrl(requestUrl: string, env?: string): string {
  if (env && env.trim()) return env.trim().replace(/\/$/, '')
  return new URL(requestUrl).origin
}

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (rawName === name) {
      return rest.join('=')
    }
  }

  return null
}

export function buildSessionCookie(
  token: string,
  options: {
    secure: boolean
    sameSite: 'Lax' | 'None'
    expiresAt?: number
    cookieName?: string
  },
): string {
  const attributes = [
    'HttpOnly',
    'Path=/',
    `SameSite=${options.sameSite}`,
  ].filter(Boolean)

  if (options.secure) {
    attributes.unshift('Secure')
  }

  if (typeof options.expiresAt === 'number') {
    attributes.push(`Expires=${new Date(options.expiresAt).toUTCString()}`)
  }

  const cookieName = options.cookieName ?? 'indkobsvogn_session'

  return `${cookieName}=${token}; ${attributes.join('; ')}`
}
