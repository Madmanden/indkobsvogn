import { useEffect, useRef, useState } from 'react'

interface Props {
  onCreate: (name: string, location: string) => Promise<void> | void
  onCancel: () => void
}

export function AddStoreModal({ onCreate, onCancel }: Props) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setName('')
    setLocation('')
    setError(null)
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  async function submit(): Promise<void> {
    const trimmedName = name.trim().replace(/\s+/g, ' ')
    const trimmedLocation = location.trim().replace(/\s+/g, ' ')

    if (!trimmedName || !trimmedLocation) {
      setError('Udfyld både navn og lokation.')
      return
    }

    try {
      await onCreate(trimmedName, trimmedLocation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Der opstod en fejl.')
    }
  }

  return (
    <div className="modal-backdrop add-store-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="add-store-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-store-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Ny butik</p>
        <h2 className="title title-small" id="add-store-title">
          Tilføj ny butik
        </h2>
        <p className="auth-copy">
          Giv butikken et navn og en lokation, så den dukker op rigtigt i butikslisten.
        </p>

        <form
          className="add-store-form"
          onSubmit={async (event) => {
            event.preventDefault()
            await submit()
          }}
        >
          <label className="add-store-field" htmlFor="add-store-name">
            <span className="settings-field-label">Butiksnavn</span>
            <input
              ref={nameInputRef}
              id="add-store-name"
              className="add-store-input"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError(null)
              }}
              placeholder="F.eks. Lidl"
              autoComplete="off"
            />
          </label>

          <label className="add-store-field" htmlFor="add-store-location">
            <span className="settings-field-label">Lokation</span>
            <input
              id="add-store-location"
              className="add-store-input"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value)
                if (error) setError(null)
              }}
              placeholder="F.eks. Virum"
              autoComplete="off"
            />
          </label>

          {error ? <p className="auth-status">{error}</p> : null}

          <div className="add-store-actions">
            <button type="submit" className="btn-primary">
              Opret butik
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Annuller
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
