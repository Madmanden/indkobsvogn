import { useRef, type ChangeEvent } from 'react'
import type { AppState, GroceryStore } from '../domain/models'
import { readFileAsOptimizedDataUrl } from '../utils/images'
import { isQuotaExceededError } from '../utils/storage'
import { SyncIndicator } from './SyncIndicator'

interface Props {
  state: AppState
  commit: (next: AppState) => void
  selectedStore: GroceryStore
  onBack: () => void
  onDeleteStore: () => void
  syncStatus: Parameters<typeof SyncIndicator>[0]['status']
}

export function StoreSettingsScreen({
  state,
  commit,
  selectedStore,
  onBack,
  onDeleteStore,
  syncStatus,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function updateSelectedStore(patch: Partial<GroceryStore>): void {
    commit({
      ...state,
      stores: state.stores.map((store) =>
        store.id === selectedStore.id
          ? {
              ...store,
              ...patch,
            }
          : store,
      ),
    })
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const loyaltyCardImage = await readFileAsOptimizedDataUrl(file)

      try {
        updateSelectedStore({
          loyaltyCardImage,
          loyaltyCardScope: 'global',
        })
      } catch (error) {
        if (isQuotaExceededError(error)) {
          window.alert('Kortbilledet fylder stadig for meget til lagring. Brug et mindre screenshot.')
          return
        }

        throw error
      }
    } catch (error) {
      console.error('Failed to read/save loyalty card image:', error)
      window.alert('Kortbilledet kunne ikke læses eller gemmes.')
    } finally {
      event.target.value = ''
    }
  }

  function removeCard(): void {
    updateSelectedStore({
      loyaltyCardImage: undefined,
      loyaltyCardScope: 'global',
    })
  }

  function toggleFavorite(): void {
    updateSelectedStore({
      isFavorite: !selectedStore.isFavorite,
    })
  }

  function updateStoreIdentity(field: 'name' | 'subtitle', value: string): void {
    const normalized = value.trim().replace(/\s+/g, ' ')
    if (!normalized || normalized === selectedStore[field]) return

    updateSelectedStore({
      [field]: normalized,
    })
  }

  function deleteStore(): void {
    const confirmed = window.confirm(
      `Fjern ${selectedStore.name}?\n\nButikken slettes sammen med dens indkoebsliste og historik. Varer forbliver gemt.`,
    )

    if (!confirmed) return
    onDeleteStore()
  }

  return (
    <section className="settings-screen">
      <header className="header-block">
        <div className="settings-topbar">
          <button type="button" className="btn-back" onClick={onBack}>
            Butikker
          </button>
          <SyncIndicator status={syncStatus} />
        </div>
      </header>

      <section className="list-block settings-panel">
        <article className="settings-card settings-card--store">
          <div className="settings-card-header settings-card-header--store">
            <div className="settings-card-title-row">
              <h2 className="settings-title">Butik</h2>
              <button
                type="button"
                className={`favorite-toggle ${selectedStore.isFavorite ? 'is-active' : ''}`}
                onClick={toggleFavorite}
                aria-pressed={selectedStore.isFavorite}
                aria-label={selectedStore.isFavorite ? 'Fjern som favorit' : 'Markér som favorit'}
              >
                <span className="favorite-toggle-star" aria-hidden="true">
                  ★
                </span>
                <span>{selectedStore.isFavorite ? 'Favorit' : 'Markér favorit'}</span>
              </button>
            </div>

            <p className="settings-copy">Opdater navn og lokation for denne butik.</p>
          </div>

          <div className="settings-identity-list">
            <label className="settings-field-row">
              <span className="settings-field-label">Butiksnavn</span>
              <input
                className="settings-field-input settings-field-input--name"
                defaultValue={selectedStore.name}
                aria-label="Butiksnavn"
                onBlur={(event) => updateStoreIdentity('name', event.target.value)}
              />
            </label>

            <label className="settings-field-row">
              <span className="settings-field-label">Lokation</span>
              <input
                className="settings-field-input settings-field-input--location"
                defaultValue={selectedStore.subtitle}
                aria-label="Lokation"
                onBlur={(event) => updateStoreIdentity('subtitle', event.target.value)}
              />
            </label>
          </div>

          <div className="settings-actions-stack settings-actions-stack--store-meta">
            <button type="button" className="btn-danger btn-danger--dotted" onClick={deleteStore}>
              Fjern butik
            </button>
          </div>
        </article>

        <article className="settings-card settings-card--loyalty">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-title">Loyalitetskort</h2>
              <p className="settings-copy">Upload et screenshot eller billede af kortet.</p>
            </div>
          </div>

          <div className="card-preview">
            {selectedStore.loyaltyCardImage ? (
              <img src={selectedStore.loyaltyCardImage} alt={`Loyalitetskort for ${selectedStore.name}`} />
            ) : (
              <div className="card-preview-empty">
                <span>Ingen kortfil endnu</span>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={onFileChange}
          />

          <div className="settings-actions-stack">
            <button
              type="button"
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedStore.loyaltyCardImage ? 'Udskift kort' : 'Tilføj loyalitetskort'}
            </button>

            {selectedStore.loyaltyCardImage ? (
              <button type="button" className="btn-secondary" onClick={removeCard}>
                Fjern kort
              </button>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  )
}
