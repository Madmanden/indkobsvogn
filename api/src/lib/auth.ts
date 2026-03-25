import type { Context, Next } from 'hono'
import type { Env } from './runtime'
import { getCookieValue, buildSessionCookie } from './http'
import type { AuthenticatedUser } from './runtime'
import { Repository } from './repository'
import { isEmailAllowed } from './allowlist'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

export interface AuthedContextVariables {
  user: AuthenticatedUser
}

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AuthedContextVariables }>, next: Next) {
  const cookieName = c.env.SESSION_COOKIE_NAME ?? 'indkobsvogn_session'
  const sessionToken = getCookieValue(c.req.header('cookie') ?? null, cookieName)

  if (!sessionToken) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const repository = new Repository(c.env.DB)
  const session = await repository.getSession(sessionToken)

  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      await repository.deleteSession(sessionToken)
    }

    return c.json({ error: 'unauthorized' }, 401)
  }

  const userRecord = await c.env.DB
    .prepare('SELECT id, email, created_at FROM users WHERE id = ? LIMIT 1')
    .bind(session.userId)
    .first<{ id: string; email: string; created_at: number }>()

  if (!userRecord) {
    await repository.deleteSession(sessionToken)
    return c.json({ error: 'unauthorized' }, 401)
  }

  if (!isEmailAllowed(userRecord.email, c.env.ALLOWED_EMAILS)) {
    await repository.deleteSession(sessionToken)
    return c.json({ error: 'email_not_allowed' }, 403)
  }

  c.set('user', {
    id: userRecord.id,
    email: userRecord.email,
  })

  await next()
}

export function createSessionCookie(
  token: string,
  requestUrl: string,
  expiresAt: number,
  cookieName?: string,
): string {
  const secure = new URL(requestUrl).protocol === 'https:'
  return buildSessionCookie(token, {
    secure,
    sameSite: 'Lax',
    expiresAt,
    cookieName,
  })
}

export function createSessionExpiry(): number {
  return Date.now() + SESSION_TTL_MS
}

export async function sendMagicLink(options: {
  apiUrl: string
  email: string
  token: string
  resendApiKey?: string
  fromEmail?: string
}): Promise<void> {
  const verifyUrl = `${options.apiUrl.replace(/\/$/, '')}/api/auth/sign-in/verify?token=${encodeURIComponent(options.token)}`

  if (!options.resendApiKey) {
    // When Resend is not configured, log email only (not the token URL) for debugging
    console.info(`Magic link requested for ${options.email} (Resend not configured)`)
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.fromEmail ?? 'Indkøbsvogn <no-reply@indkobsvogn.local>',
      to: options.email,
      subject: 'Your Indkøbsvogn login link',
      html: `<p>Open this link to sign in:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`Resend request failed: ${response.status} ${text}`)
    throw new Error('mail_delivery_failed')
  }
}
