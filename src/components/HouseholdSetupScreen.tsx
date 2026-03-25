import { useState } from 'react'
import type { HouseholdRecord } from '../api/client'

interface Props {
  userEmail?: string | null
  hasLocalData: boolean
  onCreate: (includeLocalData: boolean) => Promise<HouseholdRecord>
  onJoin: (code: string) => Promise<HouseholdRecord>
  onSignOut: () => Promise<void>
}

export function HouseholdSetupScreen({ userEmail, hasLocalData, onCreate, onJoin, onSignOut }: Props) {
  const [code, setCode] = useState('')
  const [includeLocalData, setIncludeLocalData] = useState(hasLocalData)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function create(): Promise<void> {
    setSubmitting(true)
    setMessage(null)

    try {
      await onCreate(includeLocalData)
      setMessage('Husstand oprettet.')
    } catch (error) {
      console.error('Failed to create household:', error)
      if (error instanceof Error && error.message === 'unauthorized') {
        setMessage('Din login-session er udløbet. Log ind igen.')
      } else {
        setMessage('Kunne ikke oprette husstanden.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function join(): Promise<void> {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return

    setSubmitting(true)
    setMessage(null)

    try {
      await onJoin(trimmed)
      setMessage('Husstanden er tilknyttet.')
    } catch (error) {
      console.error('Failed to join household:', error)
      if (error instanceof Error) {
        if (error.message === 'unknown_household') {
          setMessage('Koden blev ikke fundet.')
          return
        }

        if (error.message === 'household_full') {
          setMessage('Denne husstand har allerede to medlemmer.')
          return
        }

        if (error.message === 'unauthorized') {
          setMessage('Din login-session er udløbet. Log ind igen.')
          return
        }
      }

      setMessage('Kunne ikke tilknytte koden.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-screen household-screen">
      <section className="auth-card">
        <header className="header-block auth-header">
          <p className="eyebrow">Indkøbsvogn</p>
          <h1 className="title">Husstand</h1>
          <p className="auth-copy">
            {userEmail ? `Logget ind som ${userEmail}.` : 'Vælg om du vil oprette eller tilknytte en husstand.'}
          </p>
        </header>

        {hasLocalData ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={includeLocalData}
              onChange={(event) => setIncludeLocalData(event.target.checked)}
            />
            <span>Brug min lokale v1-data i denne husstand</span>
          </label>
        ) : (
          <p className="auth-status auth-status--muted">Ingen lokal data fundet.</p>
        )}

        <div className="auth-form">
          <button type="button" className="btn-primary" onClick={create} disabled={submitting}>
            {submitting ? 'Arbejder...' : 'Opret husstand'}
          </button>

          <label className="auth-label" htmlFor="join-code">
            Eller tilknyt med kode
          </label>
          <input
            id="join-code"
            className="auth-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="HOLM-42"
            autoCapitalize="characters"
          />
          <button type="button" className="btn-secondary" onClick={join} disabled={submitting}>
            Tilknyt kode
          </button>

          <button type="button" className="btn-secondary" onClick={onSignOut} disabled={submitting}>
            Log ud
          </button>

          {message ? <p className="auth-status">{message}</p> : null}
        </div>
      </section>
    </section>
  )
}
