import { useEffect, useState } from 'react'
import type { SignInResponse } from '../api/client'
import { clearLoginDraft, readLoginDraft, writeLoginDraft } from '../auth/loginDraft'
import { getLoginErrorMessage } from './loginErrors'

interface Props {
  onSignIn: (email: string) => Promise<SignInResponse>
  onVerifyCode: (email: string, code: string) => Promise<void>
  authError?: string | null
}

function readAuthErrorParam(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const authError = params.get('authError')
  if (!authError) return null

  params.delete('authError')
  const nextSearch = params.toString()
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', nextUrl)

  return authError
}

export function LoginScreen({ onSignIn, onVerifyCode, authError }: Props) {
  const [email, setEmail] = useState(() => readLoginDraft()?.email ?? '')
  const [code, setCode] = useState(() => readLoginDraft()?.code ?? '')
  const [message, setMessage] = useState<string | null>(() => {
    const authErrorParam = readAuthErrorParam()
    return authErrorParam ? getLoginErrorMessage(new Error(authErrorParam)) : null
  })
  const [codeMessage, setCodeMessage] = useState<string | null>(null)
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [linkSent, setLinkSent] = useState(() => readLoginDraft()?.linkSent ?? false)

  useEffect(() => {
    if (linkSent && email.trim()) {
      writeLoginDraft({ email: email.trim(), code, linkSent: true })
    } else {
      clearLoginDraft()
    }
  }, [email, code, linkSent])

  useEffect(() => {
    return () => {
      clearLoginDraft()
    }
  }, [])

  async function submit(): Promise<void> {
    const trimmed = email.trim()
    if (!trimmed) return

    setSubmitting(true)
    setMessage(null)
    setCodeMessage(null)
    setVerificationUrl(null)
    setCode('')

    try {
      const result = await onSignIn(trimmed)
      setLinkSent(true)
      if (result.backupCode) {
        setCode(result.backupCode)
      }

      if (result.verificationUrl) {
        setVerificationUrl(result.verificationUrl)
      }

      if (result.deliveryStatus === 'local') {
        setMessage('E-mailafsendelse er ikke sat op, så brug test-linket eller den viste kode.')
      } else if (result.deliveryStatus === 'fallback') {
        setMessage('E-mail kunne ikke sendes lige nu, så brug den viste kode i stedet.')
      } else {
        setMessage('Tjek din e-mail for en 6-cifret kode, og indtast den herunder.')
      }
    } catch (error) {
      setMessage(getLoginErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function submitCode(): Promise<void> {
    const trimmedEmail = email.trim()
    const trimmedCode = code.trim()
    if (!trimmedEmail || !/^\d{6}$/.test(trimmedCode)) {
      setCodeMessage('Indtast den 6-cifrede kode fra mailen.')
      return
    }

    setVerifying(true)
    setCodeMessage(null)

    try {
      await onVerifyCode(trimmedEmail, trimmedCode)
    } catch (error) {
      setCodeMessage(getLoginErrorMessage(error))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <section className="auth-screen auth-screen--login">
      <section className="auth-card">
        <header className="header-block auth-header">
          <p className="eyebrow">Indkøbsvogn</p>
          <h1 className="title">Log ind</h1>
          <p className="auth-copy">
            Vi sender en 6-cifret kode til din e-mail, så du kan synkronisere husstandens indkøbsliste.
          </p>
        </header>

        <div className="auth-form">
          <label className="auth-label" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="navn@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (linkSent) {
                setLinkSent(false)
                setCode('')
                setMessage(null)
                setCodeMessage(null)
                setVerificationUrl(null)
              }
            }}
          />
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Sender...' : linkSent ? 'Send ny kode' : 'Send login-kode'}
          </button>
          {authError ? <p className="auth-status">{authError}</p> : null}
          {message ? <p className="auth-status">{message}</p> : null}
          {verificationUrl ? (
            <a className="auth-link" href={verificationUrl}>
              Åbn test-link
            </a>
          ) : null}

          {linkSent ? (
            <>
              <label className="auth-label" htmlFor="code">
                6-cifret kode
              </label>
              <input
                id="code"
                className="auth-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button type="button" className="btn-primary" onClick={submitCode} disabled={verifying}>
                {verifying ? 'Bekræfter...' : 'Log ind med kode'}
              </button>
              {codeMessage ? <p className="auth-status">{codeMessage}</p> : null}
              <p className="auth-status auth-status--muted">
                Mailen indeholder også et link, men det åbner i browseren – brug koden her i appen.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </section>
  )
}
