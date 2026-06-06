import { useState } from 'react'
import { getLoginErrorMessage } from './loginErrors'

interface Props {
  onSignIn: (email: string) => Promise<{ verificationUrl?: string }>
  onVerifyCode: (email: string, code: string) => Promise<void>
  authError?: string | null
}

export function LoginScreen({ onSignIn, onVerifyCode, authError }: Props) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [codeMessage, setCodeMessage] = useState<string | null>(null)
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  async function submit(): Promise<void> {
    const trimmed = email.trim()
    if (!trimmed) return

    setSubmitting(true)
    setMessage(null)
    setCodeMessage(null)
    setVerificationUrl(null)

    try {
      const result = await onSignIn(trimmed)
      setMessage('Tjek din e-mail for et login-link eller en 6-cifret kode.')
      setLinkSent(true)
      if (result.verificationUrl) {
        setVerificationUrl(result.verificationUrl)
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
          <p className="auth-copy">Brug magic link eller 6-cifret kode for at synkronisere husstandens indkøbsliste.</p>
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
            {submitting ? 'Sender...' : linkSent ? 'Send ny mail' : 'Send login-mail'}
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
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button type="button" className="btn-primary" onClick={submitCode} disabled={verifying}>
                {verifying ? 'Bekræfter...' : 'Log ind med kode'}
              </button>
              {codeMessage ? <p className="auth-status">{codeMessage}</p> : null}
            </>
          ) : null}
        </div>
      </section>
    </section>
  )
}
