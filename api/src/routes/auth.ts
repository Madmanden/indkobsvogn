import { Hono } from 'hono'
import type { Env } from '../lib/runtime'
import { createToken, createId, createNumericCode } from '../lib/crypto'
import { normalizeEmail, jsonError, buildSessionCookie, getBaseUrl, getCookieValue } from '../lib/http'
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

function buildCodeTokenKey(email: string, code: string): string {
  return `code:${email}:${code}`
}

function isLocalSignInAllowed(env: Env): boolean {
  return env.ALLOW_LOCAL_SIGNIN === '1' || env.ALLOW_LOCAL_SIGNIN === 'true'
}

function renderSignInConfirmPage(token: string, actionUrl: string): string {
  const safeToken = token.replace(/[^a-zA-Z0-9]/g, '')
  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Log ind – Indkøbsvogn</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f7f8f6; color: #2b3a2f; }
    main { max-width: 420px; margin: 64px auto; padding: 0 16px; text-align: center; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    p { font-size: 15px; color: #57685e; }
    button { margin-top: 24px; padding: 12px 22px; font-size: 16px; font-weight: 600; border: none; border-radius: 999px; cursor: pointer; color: #fff; background: #2b6b3f; }
    button:focus { outline: 2px solid #1f4f2b; outline-offset: 2px; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Indkøbsvogn</p>
    <h1>Log ind</h1>
    <p>Du er ved at åbne et engangs-login-link. Det virker kun i browseren på den enhed, hvor du har anmodt om det.</p>
    <form method="post" action="${actionUrl}">
      <input type="hidden" name="token" value="${safeToken}" />
      <button type="submit">Log ind</button>
    </form>
  </main>
</body>
</html>`
}

authRouter.post('/sign-in', async (c) => {
  try {
    await ensureDatabaseReady(c.env.DB)

    const body = (await c.req.json().catch(() => null)) as { email?: string } | null
    const email = body?.email ? normalizeEmail(body.email) : ''

    if (!email) {
      return signInError(c, 400, 'missing_email', 'Skriv en e-mailadresse først.')
    }

    // Rate limit by email (throttles allowlist probing too)
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

    await recordAttempt(c.env.DB, `signin:${email}`)

    if (!isEmailAllowed(email, c.env.ALLOWED_EMAILS)) {
      return signInError(c, 403, 'email_not_allowed', 'Den e-mail er ikke på tilladelseslisten.')
    }

    const apiUrl = getBaseUrl(c.req.url, c.env.FRONTEND_URL)
    const repository = new Repository(c.env.DB)

    // Invalidate any previously issued tokens, then clean up expired ones
    await repository.deleteVerificationTokensForEmail(email)
    await repository.deleteExpiredVerificationTokens()
    await repository.deleteExpiredSessions()

    // Decide delivery mode before minting tokens. Fail closed in production when
    // Resend is not configured and local sign-in has not been explicitly enabled.
    let deliveryStatus: 'sent' | 'local' | 'fallback' = 'sent'
    if (!c.env.RESEND_API_KEY) {
      if (isLocalSignInAllowed(c.env)) {
        deliveryStatus = 'local'
      } else {
        return signInError(
          c,
          503,
          'sign_in_failed',
          'Login via e-mail er ikke konfigureret. Kontakt support.',
        )
      }
    }

    await repository.createUser(email)

    const token = createToken(48)
    const code = createNumericCode(6)
    const expiresAt = Date.now() + 1000 * 60 * 15
    await repository.saveVerificationToken(token, email, expiresAt)
    await repository.saveVerificationToken(buildCodeTokenKey(email, code), email, expiresAt)

    const verificationUrl = `${apiUrl}/api/auth/sign-in/verify?token=${encodeURIComponent(token)}`

    if (deliveryStatus !== 'local') {
      try {
        await sendMagicLink({
          apiUrl,
          email,
          token,
          code,
          resendApiKey: c.env.RESEND_API_KEY,
          fromEmail: c.env.FROM_EMAIL,
        })
      } catch (error) {
        console.error('Sign-in mail delivery failed:', error)
        deliveryStatus = 'fallback'
      }
    }

    return c.json({
      ok: true,
      verificationUrl: deliveryStatus === 'local' ? verificationUrl : undefined,
      backupCode: deliveryStatus === 'sent' ? undefined : code,
      deliveryStatus,
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

// A GET must never consume the token (mail clients pre-fetch links). It only
// inspects validity and renders a confirmation page whose form POSTs to consume.
authRouter.get('/sign-in/verify', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const token = c.req.query('token')
  const frontendUrl = getBaseUrl(c.req.url, c.env.FRONTEND_URL)

  if (!token) {
    return c.redirect(`${frontendUrl}?authError=invalid_token`, 303)
  }

  const repository = new Repository(c.env.DB)
  const verificationToken = await repository.peekVerificationToken(token)

  if (!verificationToken || !isEmailAllowed(verificationToken.email, c.env.ALLOWED_EMAILS)) {
    return c.redirect(`${frontendUrl}?authError=invalid_token`, 303)
  }

  return c.html(renderSignInConfirmPage(token, '/api/auth/sign-in/verify'), 200, {
    'Content-Type': 'text/html; charset=utf-8',
  })
})

authRouter.post('/sign-in/verify', async (c) => {
  await ensureDatabaseReady(c.env.DB)

  const frontendUrl = getBaseUrl(c.req.url, c.env.FRONTEND_URL)
  const body = await c.req.parseBody()
  const token = typeof body?.token === 'string' ? body.token : null

  if (!token) {
    return c.redirect(`${frontendUrl}?authError=invalid_token`, 303)
  }

  const repository = new Repository(c.env.DB)
  const verificationToken = await repository.consumeVerificationToken(token)

  if (!verificationToken || !isEmailAllowed(verificationToken.email, c.env.ALLOWED_EMAILS)) {
    return c.redirect(`${frontendUrl}?authError=invalid_token`, 303)
  }

  const user = await repository.createUser(verificationToken.email)
  const sessionToken = createId('session')
  const session = await repository.createSession(user.id, sessionToken, createSessionExpiry())

  c.header(
    'Set-Cookie',
    createSessionCookie(session.token, c.req.url, session.expiresAt, c.env.SESSION_COOKIE_NAME),
  )

  await repository.deleteExpiredSessions()
  return c.redirect(frontendUrl, 303)
})

authRouter.post('/sign-in/verify-code', async (c) => {
  try {
    await ensureDatabaseReady(c.env.DB)

    const body = (await c.req.json().catch(() => null)) as { email?: string; code?: string } | null
    const email = body?.email ? normalizeEmail(body.email) : ''
    const code = (body?.code ?? '').trim()

    if (!email || !/^\d{6}$/.test(code)) {
      return signInError(c, 400, 'invalid_code', 'Indtast den 6-cifrede kode fra mailen.')
    }

    const rateLimit = await checkRateLimit(c.env.DB, `verify:${email}`)
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      c.header('Retry-After', String(retryAfter))
      return signInError(
        c,
        429,
        'too_many_requests',
        'For mange forsøg. Vent et øjeblik og prøv igen.',
      )
    }
    await recordAttempt(c.env.DB, `verify:${email}`)

    const repository = new Repository(c.env.DB)
    const verificationToken = await repository.consumeVerificationToken(buildCodeTokenKey(email, code))
    if (!verificationToken || verificationToken.email !== email) {
      return signInError(c, 401, 'invalid_code', 'Koden er forkert eller udløbet.')
    }

    if (!isEmailAllowed(verificationToken.email, c.env.ALLOWED_EMAILS)) {
      return signInError(c, 403, 'email_not_allowed', 'Den e-mail er ikke på tilladelseslisten.')
    }

    const user = await repository.createUser(verificationToken.email)
    const sessionToken = createId('session')
    const session = await repository.createSession(user.id, sessionToken, createSessionExpiry())

    c.header(
      'Set-Cookie',
      createSessionCookie(session.token, c.req.url, session.expiresAt, c.env.SESSION_COOKIE_NAME),
    )

    await repository.deleteExpiredSessions()
    return c.json({ ok: true })
  } catch (error) {
    console.error('Verify code failed:', error)
    return signInError(c, 503, 'verify_failed', 'Kunne ikke bekræfte koden lige nu. Prøv igen om lidt.')
  }
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
