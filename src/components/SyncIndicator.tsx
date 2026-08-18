import type { SyncStatus } from '../sync/engine'

interface Props {
  status: SyncStatus
}

export function SyncIndicator({ status }: Props) {
  if (status.lastError === 'unauthorized') {
    return (
      <div
        className="sync-indicator error"
        aria-live="polite"
        role="status"
        aria-label="Session udløbet – åb login"
        title="Session udløbet – åb login"
      >
        <span className="sync-dot" aria-hidden="true" />
        <span>Log ind igen</span>
      </div>
    )
  }

  if (!status.online) {
    return (
      <div
        className="sync-indicator offline"
        aria-live="polite"
        role="status"
        aria-label="Fra netværket – ændringer gemmes lokalt"
        title="Ingen forbindelse"
      >
        <span className="sync-dot" aria-hidden="true" />
        <span>Offline</span>
      </div>
    )
  }

  if (status.syncing) {
    return (
      <div
        className="sync-indicator syncing"
        aria-live="polite"
        role="status"
        aria-label="Synkroniserer"
        title="Synkroniserer"
      >
        <span className="sync-dot" aria-hidden="true" />
        <span>Synkroniserer…</span>
      </div>
    )
  }

  if (status.lastError) {
    return (
      <div
        className="sync-indicator error"
        aria-live="polite"
        role="status"
        aria-label={`Synkroniseringsfejl: ${status.lastError}`}
        title={status.lastError}
      >
        <span className="sync-dot" aria-hidden="true" />
        <span>Synk-fejl</span>
      </div>
    )
  }

  if (status.pending) {
    return (
      <div
        className="sync-indicator pending"
        aria-live="polite"
        role="status"
        aria-label="Afventer sync"
        title="Afventer synkning"
      >
        <span className="sync-dot" aria-hidden="true" />
        <span>Har uliggende ændringer</span>
      </div>
    )
  }

  return null
}
