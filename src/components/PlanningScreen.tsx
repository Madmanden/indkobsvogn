import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import type { AppState, GroceryStore, Item, ListItem } from '../domain/models'
import { getPlanningRows } from '../utils/list'
import { normalizeItemName, similarity } from '../utils/fuzzy'
import { createId } from '../utils/id'

interface UndoState {
  listItem: ListItem
  index: number
}

interface Props {
  state: AppState
  commit: (next: AppState) => void
  selectedStore: GroceryStore
  onStartShopping: () => void
  onBack: () => void
}

export function PlanningScreen({
  state: appState,
  commit,
  selectedStore,
  onStartShopping,
  onBack,
}: Props) {
  const [addInput, setAddInput] = useState('')
  const [undoState, setUndoState] = useState<UndoState | null>(null)

  const undoTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])

  const planningRows = useMemo(() => getPlanningRows(appState), [appState])

  const fuzzyMatch = useMemo(() => {
    const value = addInput.trim()
    if (value.length < 3) return null

    const best = appState.items.reduce(
      (acc, item) => {
        const score = similarity(value, item.name)
        if (score > acc.score) return { item, score }
        return acc
      },
      { item: null as Item | null, score: 0 },
    )

    const exact = best.item && normalizeItemName(best.item.name) === normalizeItemName(value)
    if (!best.item || exact || best.score < 0.8) return null

    return best.item
  }, [addInput, appState.items])

  const autocompleteSuggestions = useMemo(() => {
    const value = addInput.trim().toLowerCase()
    if (value.length < 1) return []

    return [...appState.items]
      .filter((item) => item.name.toLowerCase().includes(value))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 5)
  }, [addInput, appState.items])

  function clearUndoTimer(): void {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = null
    }
  }

  function scheduleUndoClear(): void {
    clearUndoTimer()
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoState(null)
      undoTimeoutRef.current = null
    }, 3000)
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
      weightedPosition: 1,
    }

    commit({
      ...appState,
      items: [...appState.items, nextItem],
      list: [...appState.list, nextListItem],
    })
  }

  function addItem(): void {
    const value = addInput.trim()
    if (!value) return

    const normalizedInput = normalizeItemName(value)
    const exactMatch = appState.items.find((item) => normalizeItemName(item.name) === normalizedInput)

    if (exactMatch) {
      addExistingItem(exactMatch)
      return
    }

    addFreshItem(value)
    setAddInput('')
  }

  function createNewItemFromInput(): void {
    const value = addInput.trim()
    if (!value) return

    addFreshItem(value)
    setAddInput('')
  }

  function addExistingItem(match: Item): void {
    const now = Date.now()

    const existingEntry = appState.list.find(
      (entry) => entry.itemId === match.id && entry.storeId === appState.selectedStoreId,
    )
    const nextList = existingEntry
      ? appState.list.map((entry) =>
          entry.itemId === match.id && entry.storeId === appState.selectedStoreId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        )
      : [
          ...appState.list,
          {
            itemId: match.id,
            storeId: appState.selectedStoreId,
            quantity: match.defaultQuantity,
            addedAt: now,
            weightedPosition: 1,
          },
        ]

    commit({
      ...appState,
      items: appState.items.map((entry) =>
        entry.id === match.id ? { ...entry, lastUsedAt: now } : entry,
      ),
      list: nextList,
    })

    setAddInput('')
  }

  function renameItem(id: string, value: string): void {
    const nextName = value.trim()
    if (!nextName) return

    commit({
      ...appState,
      items: appState.items.map((item) => (item.id === id ? { ...item, name: nextName } : item)),
    })
  }

  function updateQty(id: string, nextQty: number): void {
    const quantity = Math.max(1, Math.round(nextQty))

    commit({
      ...appState,
      items: appState.items.map((item) =>
        item.id === id ? { ...item, defaultQuantity: quantity } : item,
      ),
      list: appState.list.map((item) =>
        item.itemId === id && item.storeId === appState.selectedStoreId ? { ...item, quantity } : item,
      ),
    })
  }

  function updateQtyFromInput(id: string, rawValue: string): void {
    const digitsOnly = rawValue.replace(/[^\d]/g, '')
    if (!digitsOnly) return

    const nextQty = Number.parseInt(digitsOnly, 10)
    if (Number.isNaN(nextQty)) return

    updateQty(id, nextQty)
  }

  function removeFromCurrentList(id: string): void {
    const index = appState.list.findIndex(
      (item) => item.itemId === id && item.storeId === appState.selectedStoreId,
    )
    if (index < 0) return

    const removed = appState.list[index]

    commit({
      ...appState,
      list: appState.list.filter(
        (item) => !(item.itemId === id && item.storeId === appState.selectedStoreId),
      ),
      currentSequence: appState.currentSequence.filter((itemId) => itemId !== id),
    })

    setUndoState({ listItem: removed, index })
    scheduleUndoClear()
  }

  function undoRemoveFromList(): void {
    if (!undoState) return

    if (
      appState.list.some(
        (entry) =>
          entry.itemId === undoState.listItem.itemId &&
          entry.storeId === undoState.listItem.storeId,
      )
    ) {
      clearUndoTimer()
      setUndoState(null)
      return
    }

    const nextList = [...appState.list]
    const insertionIndex = Math.min(undoState.index, nextList.length)
    nextList.splice(insertionIndex, 0, undoState.listItem)

    commit({
      ...appState,
      list: nextList,
    })

    clearUndoTimer()
    setUndoState(null)
  }

  function onAddKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') addItem()
  }

  return (
    <section className="planning-screen">
      <header className="header-block with-divider">
        <div className="header-top">
          <button type="button" className="btn-back" onClick={onBack}>
            Butikker
          </button>
          <span className="header-badge" aria-hidden="true">
            {selectedStore.name}
          </span>
        </div>
        <div className="header-copy">
          <p className="eyebrow">Indkøbsvogn</p>
          <h1 className="title">Indkøbsliste</h1>
        </div>
        <div className="header-meta">
          <span className="meta-count">{planningRows.length} varer</span>
        </div>
      </header>

      <section className="add-row-wrap">
        <div className="add-row">
          <input
            className="add-input"
            placeholder="Tilføj vare…"
            value={addInput}
            onChange={(event) => setAddInput(event.target.value)}
            onKeyDown={onAddKeyDown}
          />
          <button type="button" className="add-btn" onClick={addItem}>
            +
          </button>
        </div>

        {autocompleteSuggestions.length > 0 && addInput.trim().length > 0 ? (
          <div className="autocomplete-box" role="listbox" aria-label="Forslag til varer">
            <div className="autocomplete-header">
              <span>Forslag</span>
              <span>{autocompleteSuggestions.length} mulige</span>
            </div>
            {autocompleteSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.id}
                className="autocomplete-item"
                onClick={() => addExistingItem(suggestion)}
                aria-label={`Tilføj ${suggestion.name}`}
              >
                <span className="autocomplete-name">{suggestion.name}</span>
                <span className="autocomplete-meta">Senest brugt</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {fuzzyMatch ? (
        <section className="fuzzy-box">
          <p>
            Mente du <strong>{fuzzyMatch.name}</strong>?
          </p>
          <div className="fuzzy-actions">
            <button type="button" onClick={() => addExistingItem(fuzzyMatch)}>
              Link til eksisterende
            </button>
            <button type="button" onClick={createNewItemFromInput}>
              Opret som ny vare
            </button>
          </div>
        </section>
      ) : null}

      <section className="list-block items">
        {planningRows.map((item) => (
          <article key={item.id} className="item-row">
            <div className="item-main inline-item-main">
              <div className="item-name-wrap">
                <input
                  className="item-name"
                  defaultValue={item.name}
                  onBlur={(event) => renameItem(item.id, event.target.value)}
                />
                <span className="item-name-edit-hint" aria-hidden="true">
                  ✎
                </span>
              </div>
              <div className="item-actions">
                <div className="qty-control">
                  <button
                    type="button"
                    className="qty-stepper"
                    aria-label={`Nedsæt antal for ${item.name}`}
                    onClick={() => updateQty(item.id, item.qty - 1)}
                  >
                    −
                  </button>
                  <input
                    className="item-qty-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={item.qty}
                    aria-label={`Antal for ${item.name}`}
                    onChange={(event) => updateQtyFromInput(item.id, event.target.value)}
                  />
                  <button
                    type="button"
                    className="qty-stepper"
                    aria-label={`Forøg antal for ${item.name}`}
                    onClick={() => updateQty(item.id, item.qty + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="item-delete"
                  aria-label={`Fjern ${item.name} fra listen`}
                  onClick={() => removeFromCurrentList(item.id)}
                >
                  <svg
                    className="item-delete-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M17.78 6.22a.75.75 0 0 1 0 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 1.06-1.06L12 10.94l4.72-4.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <footer className="footer-block with-divider-top">
        <button type="button" className="btn-primary" onClick={onStartShopping}>
          Start indkøb
        </button>
      </footer>

      {undoState ? (
        <div className="undo-snackbar" role="status" aria-live="polite">
          <span>Vare fjernet fra listen</span>
          <button type="button" onClick={undoRemoveFromList}>
            Fortryd
          </button>
        </div>
      ) : null}
    </section>
  )
}
