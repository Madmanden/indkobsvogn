import { useMemo } from 'react'
import type { GroceryStore } from '../domain/models'

const LOYALTY_ACTION_LABEL = 'Butiksindstillinger'

interface Props {
  stores: GroceryStore[]
  selectedStoreId: string
  onSelectStore: (id: string) => void
  onStartPlanning: () => void
  onOpenStoreSettings: () => void
  onAddStore: () => void
}

function StoreCartIcon() {
  return (
    <svg
      className="store-icon store-icon-cart"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 4.5h2.2l1.2 8.1c.1.7.7 1.2 1.4 1.2h8.7c.7 0 1.2-.4 1.4-1.1l1.6-6.1H7.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 12.6 7.1 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="10" cy="18.2" r="1.2" fill="currentColor" />
      <circle cx="17.3" cy="18.2" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function StoresScreen({
  stores,
  selectedStoreId,
  onSelectStore,
  onStartPlanning,
  onOpenStoreSettings,
  onAddStore,
}: Props) {
  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite))),
    [stores],
  )

  return (
    <section className="stores-screen">
      <header className="header-block">
        <p className="eyebrow">Indkøbsvogn</p>
        <h1 className="title">Vælg butik</h1>
        <p className="store-picker-copy">Vælg den butik du vil handle i.</p>
      </header>

      <section className="list-block">
        {sortedStores.map((store) => {
          const selected = store.id === selectedStoreId

          return (
            <button
              key={store.id}
              type="button"
              className={`store-card ${selected ? 'selected' : ''}`}
              onClick={() => onSelectStore(store.id)}
            >
              <StoreCartIcon />
              <span className="store-info">
                <span className="store-name">
                  {store.name}
                  {store.isFavorite ? <span className="store-favorite" aria-hidden="true">★</span> : null}
                </span>
                <span className="store-sub">{store.subtitle}</span>
                {store.loyaltyLabel ? (
                  <span className="store-loyalty">{store.loyaltyLabel} ✓</span>
                ) : null}
              </span>
              {selected ? <span className="store-check">✓</span> : null}
            </button>
          )
        })}

      </section>

      <footer className="footer-block">
        <button type="button" className="add-store-btn" onClick={onAddStore}>
          <span className="add-store-icon" aria-hidden="true">
            +
          </span>
          <span>Tilføj ny butik</span>
        </button>
        <button type="button" className="btn-primary" onClick={onStartPlanning}>
          Gå til indkøbsliste
        </button>
        <button
          type="button"
          className="btn-secondary loyalty-settings-btn"
          onClick={onOpenStoreSettings}
          aria-label={LOYALTY_ACTION_LABEL}
        >
          {LOYALTY_ACTION_LABEL}
        </button>
      </footer>
    </section>
  )
}
