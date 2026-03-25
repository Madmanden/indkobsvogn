import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAppState } from './hooks/useAppState'
import { mergeImportedState } from './utils/importExport'
import { createInitialState } from './domain/default-state'
import { completeTrip } from './domain/app-state'
import { appStore } from './domain/store'
import { StoresScreen } from './components/StoresScreen'
import { PlanningScreen } from './components/PlanningScreen'
import { ShoppingScreen } from './components/ShoppingScreen'
import { ConfirmScreen } from './components/ConfirmScreen'
import { LoyaltyScreen } from './components/LoyaltyScreen'
import { StoreSettingsScreen } from './components/StoreSettingsScreen'
import { AddStoreModal } from './components/AddStoreModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { createId } from './utils/id'
import type { GroceryStore } from './domain/models'
import { LoginScreen } from './components/LoginScreen'
import { HouseholdSetupScreen } from './components/HouseholdSetupScreen'
import { mergeServerStateIntoLocal, toSyncableState } from './api/client'
import { useAuth } from './auth/useAuth'
import {
  getSyncStatus,
  initializeSync,
  registerSyncHandlers,
  resetSyncEngine,
  type SyncStatus,
} from './sync/engine'

type Screen = 'stores' | 'planning' | 'shopping' | 'confirm' | 'loyalty' | 'store-settings'

function App() {
  const { state: appState, commit, replace } = useAppState()
  const {
    status,
    user,
    household,
    authError,
    signIn,
    signOut,
    createHousehold: createHouseholdForUser,
    joinHousehold: joinHouseholdForUser,
  } = useAuth()
  const [screen, setScreen] = useState<Screen>('stores')
  const [loyaltyReturnTo, setLoyaltyReturnTo] = useState<'shopping' | 'stores'>('shopping')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus())
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false)
  const appStateRef = useRef(appState)
  const replaceRef = useRef(replace)
  const householdId = household?.household.id ?? null

  useEffect(() => {
    appStateRef.current = appState
  }, [appState])

  useEffect(() => {
    replaceRef.current = replace
  }, [replace])

  const selectedStore = appState.stores.find((s) => s.id === appState.selectedStoreId) ?? appState.stores[0]

  const hasLocalData = useMemo(
    () => appState.stores.length > 0 || appState.items.length > 0 || appState.list.length > 0 || appState.trips.length > 0,
    [appState],
  )

  useEffect(() => {
    registerSyncHandlers({
      applyRemoteState: (next, serverVersion) => {
        replaceRef.current(next, { serverVersion })
      },
      onStatusChange: setSyncStatus,
    })
  }, [])

  useEffect(() => {
    if (status === 'authenticated' && householdId && household) {
      const householdState = mergeServerStateIntoLocal(createInitialState(), household.state)
      const syncMeta = appStore.getSyncMeta()

      if (syncMeta.householdId !== householdId) {
        replaceRef.current(householdState, {
          serverVersion: household.household.version,
          householdId,
        })
        initializeSync(householdState)
        return
      }

      initializeSync(appStateRef.current)
    } else {
      resetSyncEngine()
    }
  }, [status, household, householdId])

  function selectStore(id: string): void {
    commit({ ...appState, selectedStoreId: id })
  }

  function addStore(name: string, location: string): void {
    const newStore: GroceryStore = {
      id: createId('store'),
      name,
      subtitle: location,
      icon: '🛒',
      createdAt: Date.now(),
    }

    commit({
      ...appState,
      stores: [...appState.stores, newStore],
      selectedStoreId: appState.stores.length === 0 ? newStore.id : appState.selectedStoreId,
    })
    setIsAddStoreOpen(false)

    if (appState.stores.length === 0) {
      setScreen('planning')
    }
  }

  function openAddStoreModal(): void {
    setScreen('stores')
    setIsAddStoreOpen(true)
  }

  function deleteSelectedStore(): void {
    const remainingStores = appState.stores.filter((store) => store.id !== selectedStore.id)
    const remainingStoreIds = new Set(remainingStores.map((store) => store.id))

    commit({
      ...appState,
      stores: remainingStores,
      selectedStoreId: remainingStores[0]?.id ?? '',
      list: appState.list.filter((item) => remainingStoreIds.has(item.storeId)),
      trips: appState.trips.filter((trip) => remainingStoreIds.has(trip.storeId)),
      isShopping: false,
      currentSequence: [],
    })

    setScreen('stores')
  }

  function startShopping(): void {
    commit({
      ...appState,
      isShopping: true,
      currentSequence: [],
    })
    setScreen('shopping')
  }

  function endTrip(): void {
    commit(completeTrip(appState))
    if (selectedStore?.loyaltyCardImage) {
      setLoyaltyReturnTo('stores')
      setScreen('loyalty')
      return
    }

    setScreen('stores')
  }

  function openLoyalty(returnTo: 'shopping' | 'stores'): void {
    setLoyaltyReturnTo(returnTo)
    setScreen('loyalty')
  }

  async function handleCreateHousehold(includeLocalData: boolean) {
    const householdState = includeLocalData ? toSyncableState(appState) : undefined
    const created = await createHouseholdForUser(householdState)
    replace(mergeServerStateIntoLocal(appState, created.state), {
      serverVersion: created.household.version,
      householdId: created.household.id,
    })
    setScreen('stores')
    return created
  }

  async function handleJoinHousehold(code: string) {
    const joined = await joinHouseholdForUser(code)

    const merged = hasLocalData
      ? mergeImportedState(mergeServerStateIntoLocal(appState, joined.state), appState)
      : mergeServerStateIntoLocal(appState, joined.state)

    replace(merged, {
      serverVersion: joined.household.version,
      householdId: joined.household.id,
    })

    if (hasLocalData) {
      commit(merged)
    }

    setScreen('stores')
    return joined
  }

  async function handleSignIn(email: string): Promise<{ verificationUrl?: string }> {
    return signIn(email)
  }

  async function handleSignOut(): Promise<void> {
    await signOut()
  }

  if (status === 'loading') {
    return (
      <main className="app">
        <div className="shell">
          <section className="auth-screen">
            <p className="eyebrow">Indkøbsvogn</p>
            <h1 className="title">Indlæser...</h1>
          </section>
        </div>
      </main>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <main className="app">
        <div className="shell">
          <LoginScreen onSignIn={handleSignIn} authError={authError} />
        </div>
      </main>
    )
  }

  if (status === 'authenticated' && !household) {
    return (
      <main className="app">
        <div className="shell">
          <HouseholdSetupScreen
            userEmail={user?.email}
            hasLocalData={hasLocalData}
            onCreate={handleCreateHousehold}
            onJoin={handleJoinHousehold}
            onSignOut={handleSignOut}
          />
        </div>
      </main>
    )
  }

  if (screen !== 'stores' && !selectedStore) {
    return (
      <main className="app">
        <div className="shell">
          <section className="auth-screen">
            <p className="eyebrow">Indkøbsvogn</p>
            <h1 className="title">Vælg en butik først</h1>
            <p className="auth-copy">
              Den aktuelle visning kræver en aktiv butik. Gå tilbage og opret eller vælg en butik, før du åbner
              loyalitetskortet.
            </p>
            <button type="button" className="btn-primary" onClick={() => setScreen('stores')}>
              Tilbage til butikker
            </button>
          </section>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
      <main className="app">
        <div className="shell">
          {screen === 'stores' && (
            <ErrorBoundary>
            <StoresScreen
              stores={appState.stores}
              selectedStoreId={appState.selectedStoreId}
              onSelectStore={selectStore}
              onStartPlanning={() => setScreen('planning')}
              onOpenStoreSettings={() => setScreen('store-settings')}
              onAddStore={openAddStoreModal}
            />
          </ErrorBoundary>
        )}

        {screen === 'planning' && (
          <ErrorBoundary>
            <PlanningScreen
              state={appState}
              commit={commit}
              selectedStore={selectedStore}
              onStartShopping={startShopping}
              onBack={() => setScreen('stores')}
            />
          </ErrorBoundary>
        )}

        {screen === 'shopping' && (
          <ErrorBoundary>
            <ShoppingScreen
              state={appState}
              commit={commit}
              selectedStore={selectedStore}
              onEndShopping={() => setScreen('confirm')}
              onShowLoyalty={() => openLoyalty('shopping')}
            />
          </ErrorBoundary>
        )}

        {screen === 'confirm' && (
          <ErrorBoundary>
            <ConfirmScreen onConfirm={endTrip} onCancel={() => setScreen('shopping')} />
          </ErrorBoundary>
        )}

        {screen === 'loyalty' && (
          <ErrorBoundary>
            <LoyaltyScreen selectedStore={selectedStore} onDismiss={() => setScreen(loyaltyReturnTo)} />
          </ErrorBoundary>
        )}

        {screen === 'store-settings' && (
          <ErrorBoundary>
            <StoreSettingsScreen
              state={appState}
              commit={commit}
              selectedStore={selectedStore}
              onBack={() => setScreen('stores')}
              onDeleteStore={deleteSelectedStore}
              syncStatus={syncStatus}
            />
          </ErrorBoundary>
        )}

        {isAddStoreOpen ? (
          <AddStoreModal onCreate={addStore} onCancel={() => setIsAddStoreOpen(false)} />
        ) : null}
        </div>
      </main>
    </ErrorBoundary>
  )
}

export default App
