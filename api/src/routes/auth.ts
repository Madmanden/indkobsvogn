import { Hono } from 'hono'
import type { Env } from '../lib/runtime'
import { createToken, createId } from '../lib/crypto'
import { normalizeEmail, jsonError, buildSessionCookie, getCookieValue } from '../lib/http'
import { isEmailAllowed } from '../lib/allowlist'
import { Repository } from '../lib/repository'
import { createSessionCookie, createSessionExpiry, sendMagicLink } from '../lib/auth'
import type { AuthedContextVariables } from '../lib/auth'
import { ensureDatabaseReady } from '../lib/bootstrap'
import { checkRateLimit, recordAttempt } from '../lib/rate-limiter'

export const authRouter = new Hono<{ Bindings: Env; Variables: AuthedContextVariables }>()

function signInError(
  c: Parameters<typeof jsonError>[0],
  status: number,
  error: string,
  message: string,
) {
  return jsonError(c, status, error, { message })
}

authRouter.post('/sign-in', async (c) => {
  try {
    await ensureDatabaseReady(c.env.DB)

    const body = (await c.req.json().catch(() => null)) as { email?: string } | null
    const email = body?.email ? normalizeEmail(body.email) : ''

    if (!email) {
      return signInError(c, 400, 'missing_email', 'Skriv en e-mailadresse først.')
    }

    // Rate limit by email to prevent magic link spam
    const rateLimit = await checkRateLimit(c.env.DB, `signin:${email}`)
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      c.header('Retry-After', String(retryAfter))
      return signInError(
        c,
        429,
        'too_many_requests',
        'Der er sendt for mange login-forsøg. Vent et øjeblik og prøv igen.',
      )
    }

    if (!isEmailAllowed(email, c.env.ALLOWED_EMAILS)) {
      return signInError(c, 403, 'email_not_allowed', 'Den e-mail er ikke på tilladelseslisten.')
    }

    // Record the attempt (after allowlist check to avoid leaking allowlist info)
    await recordAttempt(c.env.DB, `signin:${email}`)

    const repository = new Repository(c.env.DB)
    await repository.createUser(email)

    const token = createToken(48)
    const expiresAt = Date.now() + 1000 * 60 * 15
    await repository.saveVerificationToken(token, email, expiresAt)

    const apiUrl = new URL(c.req.url).origin

    try {
      await sendMagicLink({
        apiUrl,
        email,
        token,
        resendApiKey: c.env.RESEND_API_KEY,
        fromEmail: c.env.FROM_EMAIL,
      })
    } catch (error) {
      console.error('Sign-in mail delivery failed:', error)
      return signInError(
        c,
        502,
        'mail_delivery_failed',
        'Kunne ikke sende login-linket lige nu. Prøv igen om lidt.',
      )
    }

    const verificationUrl = `${apiUrl}/api/auth/sign-in/verify?token=${encodeURIComponent(token)}`
    return c.json({
      ok: true,
      verificationUrl: c.env.RESEND_API_KEY ? undefined : verificationUrl,
    })
  } catch (error) {
    console.error('Sign-in failed:', error)
    return signInError(
      c,
      503,
      'sign_in_failed',
      'Kunne ikke oprette login-linket lige nu. Prøv igen om lidt.',
    )
  }
})

authRouter.get('/sign-in/verify', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const token = c.req.query('token')
  if (!token) {
    return jsonError(c, 400, 'missing_token')
  }

  const repository = new Repository(c.env.DB)
  const verificationToken = await repository.consumeVerificationToken(token)
  if (!verificationToken) {
    return jsonError(c, 401, 'invalid_token')
  }

  if (!isEmailAllowed(verificationToken.email, c.env.ALLOWED_EMAILS)) {
    return jsonError(c, 403, 'email_not_allowed')
  }

  const user = await repository.createUser(verificationToken.email)
  const sessionToken = createId('session')
  const session = await repository.createSession(user.id, sessionToken, createSessionExpiry())

  c.header(
    'Set-Cookie',
    createSessionCookie(session.token, c.req.url, session.expiresAt, c.env.SESSION_COOKIE_NAME),
  )

  const frontendUrl = c.env.FRONTEND_URL?.trim() || new URL(c.req.url).origin
  return c.redirect(frontendUrl)
})

authRouter.post('/sign-out', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const cookieName = c.env.SESSION_COOKIE_NAME ?? 'indkobsvogn_session'
  const sessionToken = getCookieValue(c.req.header('cookie') ?? null, cookieName)

  if (sessionToken) {
    const repository = new Repository(c.env.DB)
    await repository.deleteSession(sessionToken)
  }

  const secure = new URL(c.req.url).protocol === 'https:'
  c.header(
    'Set-Cookie',
    buildSessionCookie('', { secure, sameSite: 'Lax', expiresAt: 0, cookieName }),
  )

  return c.json({ ok: true })
})
