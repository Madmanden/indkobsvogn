import type { SyncConflict } from '../sync/engine'

interface Props {
  conflict: SyncConflict
  onKeepMine: () => Promise<void> | void
  onUseServer: () => void
}

export function ConflictModal({ conflict, onKeepMine, onUseServer }: Props) {
  return (
    <div className="conflict-backdrop" role="dialog" aria-modal="true">
      <section className="conflict-modal">
        <p className="eyebrow">Synkronisering</p>
        <h2 className="title title-small">Der er forskel på dine data</h2>
        <p className="auth-copy">
          Din app og serveren er ikke helt enige endnu. Hvis du ikke har ændret noget på denne enhed,
          er det normalt tryggest at bruge serverens version.
        </p>
        <p className="auth-copy">Vælg en version for at fortsætte synkroniseringen.</p>
        <div className="conflict-preview">
          <p>Serverversion: {conflict.serverVersion}</p>
          <p>Din version: {conflict.localState.items.length} varer</p>
          <p>Serverens version: {conflict.serverState.items.length} varer</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn-primary" onClick={onKeepMine}>
            Behold mine ændringer
          </button>
          <button type="button" className="btn-secondary" onClick={onUseServer}>
            Brug serverens version
          </button>
        </div>
      </section>
    </div>
  )
}
