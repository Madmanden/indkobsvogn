import { useMemo, useState, type KeyboardEvent } from 'react'
import type { AppState, GroceryStore, Item, ListItem } from '../domain/models'
import { getPlanningRows } from '../utils/list'
import { normalizeItemName } from '../utils/fuzzy'
import { createId } from '../utils/id'

interface Props {
  state: AppState
  commit: (next: AppState) => void
  selectedStore: GroceryStore
  onEndShopping: () => void
  onShowLoyalty: () => void
}

export function ShoppingScreen({
  state: appState,
  commit,
  selectedStore,
  onEndShopping,
  onShowLoyalty,
}: Props) {
  const [addInput, setAddInput] = useState('')
  const planningRows = useMemo(() => getPlanningRows(appState), [appState])

  const doneSet = useMemo(() => new Set(appState.currentSequence), [appState.currentSequence])

  const pendingRows = useMemo(
    () => planningRows.filter((item) => !doneSet.has(item.id)),
    [planningRows, doneSet],
  )

  const doneRows = useMemo(
    () => planningRows.filter((item) => doneSet.has(item.id)),
    [planningRows, doneSet],
  )

  function toggleShopItem(id: string): void {
    const nextSequence = doneSet.has(id)
      ? appState.currentSequence.filter((itemId) => itemId !== id)
      : [...appState.currentSequence, id]

    commit({
      ...appState,
      currentSequence: nextSequence,
    })

    if (navigator.vibrate) navigator.vibrate(15)
  }

  function addFreshItem(name: string): void {
    const normalizedName = name.trim().replace(/\s+/g, ' ')
    if (!normalizedName) return

    const now = Date.now()
    const nextItem: Item = {
      id: createId('item'),
      name: normalizedName,
      defaultQuantity: 1,
      createdAt: now,
      lastUsedAt: now,
    }

    const nextListItem: ListItem = {
      itemId: nextItem.id,
      storeId: appState.selectedStoreId,
      quantity: 1,
      addedAt: now,
      weightedPosition: 2,
    }

    commit({
      ...appState,
      items: [...appState.items, nextItem],
      list: [...appState.list, nextListItem],
    })
  }

  function addExistingItem(item: Item): void {
    const now = Date.now()
    const existingEntry = appState.list.find(
      (entry) => entry.itemId === item.id && entry.storeId === appState.selectedStoreId,
    )

    const nextList = existingEntry
      ? appState.list.map((entry) =>
          entry.itemId === item.id && entry.storeId === appState.selectedStoreId
            ? {
                ...entry,
                quantity: entry.quantity + 1,
                addedAt: now,
                weightedPosition: 2,
              }
            : entry,
        )
      : [
          ...appState.list,
          {
            itemId: item.id,
            storeId: appState.selectedStoreId,
            quantity: item.defaultQuantity,
            addedAt: now,
            weightedPosition: 2,
          },
        ]

    commit({
      ...appState,
      items: appState.items.map((entry) =>
        entry.id === item.id ? { ...entry, lastUsedAt: now } : entry,
      ),
      list: nextList,
      currentSequence: appState.currentSequence.filter((itemId) => itemId !== item.id),
    })
  }

  function addItemMidTrip(): void {
    const value = addInput.trim()
    if (!value) return

    const normalizedInput = normalizeItemName(value)
    const exactMatch = appState.items.find((item) => normalizeItemName(item.name) === normalizedInput)

    if (exactMatch) {
      addExistingItem(exactMatch)
    } else {
      addFreshItem(value)
    }

    setAddInput('')
  }

  function onAddKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') addItemMidTrip()
  }

  return (
    <section className="shopping-screen">
      <header className="header-block with-divider">
        <div className="header-top">
          <button type="button" className="btn-back" onClick={onEndShopping}>
            Afslut
          </button>
          {selectedStore.loyaltyCardImage ? (
            <button
              type="button"
              className="header-card header-card--button"
              onClick={onShowLoyalty}
              aria-label={`Åbn loyalitetskort for ${selectedStore.name}`}
            >
              <svg
                className="loyalty-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                focusable="false"
              >
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="3"
                  ry="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M3 10.5h18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <rect x="6" y="13.5" width="5" height="3" rx="0.75" fill="currentColor" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="header-copy">
          <p className="eyebrow">Indkøbsvogn</p>
          <h1 className="title">Indkøbsliste</h1>
        </div>

        <div className="header-meta">
          <p className="meta-count">
            {pendingRows.length > 0
              ? `${pendingRows.length} varer tilbage · ${doneRows.length} færdige`
              : `Alle ${doneRows.length} varer færdige 🎉`}
          </p>
        </div>
      </header>

      <section className="list-block items">
        {pendingRows.map((item) => (
          <button
            key={item.id}
            type="button"
            className="shop-row"
            onClick={() => toggleShopItem(item.id)}
          >
            <span className="check-circle">✓</span>
            <span className="shop-name">{item.name}</span>
            <span className="shop-qty">× {item.qty}</span>
          </button>
        ))}

        {doneRows.length > 0 ? <p className="done-label">Færdige</p> : null}

        {doneRows.map((item) => (
          <button
            key={item.id}
            type="button"
            className="shop-row done done-animate"
            onClick={() => toggleShopItem(item.id)}
          >
            <span className="check-circle">✓</span>
            <span className="shop-name">{item.name}</span>
            <span className="shop-qty">× {item.qty}</span>
          </button>
        ))}
      </section>

      <footer className="footer-block with-divider-top">
        <div className="shop-add-row">
          <input
            className="shop-add-input"
            placeholder="Tilføj vare under turen"
            value={addInput}
            onChange={(event) => setAddInput(event.target.value)}
            onKeyDown={onAddKeyDown}
          />
          <button type="button" className="add-btn" onClick={addItemMidTrip}>
            +
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={onEndShopping}>
          Afslut indkøb
        </button>
      </footer>
    </section>
  )
}
