import { useEffect, useState, type ReactNode } from 'react'
import type { HouseholdMeResponse, HouseholdRecord, SignInResponse } from '../api/client'
import { createHousehold, getHouseholdMe, joinHousehold, signIn as apiSignIn, signOut as apiSignOut } from '../api/client'
import { AuthContext } from './context'

function handleSessionLoadError(error: unknown, setAuthError: (value: string | null) => void): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.message === 'no_household') {
    return false
  }

  if (error.message === 'unauthorized') {
    setAuthError(null)
    return true
  }

  if (error.message === 'email_not_allowed') {
    setAuthError('Din e-mail er ikke længere tilladt.')
    return true
  }

  return false
}

function handleSessionError(
  error: unknown,
  setStatus: (status: 'loading' | 'unauthenticated' | 'authenticated') => void,
  setUser: (user: HouseholdMeResponse['user'] | null) => void,
  setHousehold: (household: HouseholdRecord | null) => void,
  setAuthError: (error: string | null) => void,
): 'handled' | 'unhandled' {
  if (error instanceof Error && error.message === 'no_household') {
    setStatus('authenticated')
    setUser((error as Error & { user?: HouseholdMeResponse['user'] }).user ?? null)
    setHousehold(null)
    setAuthError(null)
    return 'handled'
  }

  if (handleSessionLoadError(error, setAuthError)) {
    setStatus('unauthenticated')
    setUser(null)
    setHousehold(null)
    return 'handled'
  }

  console.error('Session load failed:', error)
  setAuthError('Kunne ikke oprette forbindelse til serveren.')
  setStatus('unauthenticated')
  setUser(null)
  setHousehold(null)
  return 'handled'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading')
  const [user, setUser] = useState<HouseholdMeResponse['user'] | null>(null)
  const [household, setHousehold] = useState<HouseholdRecord | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  function clearAuthError(): void {
    setAuthError(null)
  }

  async function refresh(): Promise<void> {
    try {
      const response = await getHouseholdMe()
      setUser(response.user)
      setHousehold(response)
      setStatus('authenticated')
      setAuthError(null)
    } catch (error) {
      handleSessionError(error, setStatus, setUser, setHousehold, setAuthError)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadSession(): Promise<void> {
      if (cancelled) return

      try {
        const response = await getHouseholdMe()
        if (cancelled) return

        setUser(response.user)
        setHousehold(response)
        setStatus('authenticated')
        setAuthError(null)
      } catch (error) {
        if (cancelled) return
        handleSessionError(error, setStatus, setUser, setHousehold, setAuthError)
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [])

  async function signIn(email: string): Promise<SignInResponse> {
    return apiSignIn(email)
  }

  async function signOut(): Promise<void> {
    await apiSignOut()
    setStatus('unauthenticated')
    setUser(null)
    setHousehold(null)
  }

  async function createHouseholdForUser(state?: HouseholdRecord['state']): Promise<HouseholdRecord> {
    const next = await createHousehold(state)
    setStatus('authenticated')
    setUser((current) => current)
    setHousehold(next)
    return next
  }

  async function joinHouseholdForUser(code: string): Promise<HouseholdRecord> {
    const next = await joinHousehold(code)
    setStatus('authenticated')
    setUser((current) => current)
    setHousehold(next)
    return next
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        household,
        authError,
        signIn,
        signOut,
        createHousehold: createHouseholdForUser,
        joinHousehold: joinHouseholdForUser,
        refresh,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
