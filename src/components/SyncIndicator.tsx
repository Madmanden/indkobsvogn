import type { SyncStatus } from '../sync/engine'

interface Props {
  status: SyncStatus
}

export function SyncIndicator({ status }: Props) {
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

  void status.syncing
  void status.retryingConflict
  void status.pending

  return null
}
