import { useState } from 'react'
import { getLoginErrorMessage } from './loginErrors'

interface Props {
  onSignIn: (email: string) => Promise<{ verificationUrl?: string }>
  authError?: string | null
}

export function LoginScreen({ onSignIn, authError }: Props) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(): Promise<void> {
    const trimmed = email.trim()
    if (!trimmed) return

    setSubmitting(true)
    setMessage(null)
    setVerificationUrl(null)

    try {
      const result = await onSignIn(trimmed)
      setMessage('Tjek din e-mail for et login-link.')
      if (result.verificationUrl) {
        setVerificationUrl(result.verificationUrl)
      }
    } catch (error) {
      setMessage(getLoginErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-screen auth-screen--login">
      <section className="auth-card">
        <header className="header-block auth-header">
          <p className="eyebrow">Indkøbsvogn</p>
          <h1 className="title">Log ind</h1>
          <p className="auth-copy">Brug magic link for at synkronisere husstandens indkøbsliste.</p>
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
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Sender...' : 'Send login-link'}
          </button>
          {authError ? <p className="auth-status">{authError}</p> : null}
          {message ? <p className="auth-status">{message}</p> : null}
          {verificationUrl ? (
            <a className="auth-link" href={verificationUrl}>
              Åbn test-link
            </a>
          ) : null}
        </div>
      </section>
    </section>
  )
}
