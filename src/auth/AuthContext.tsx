import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { HouseholdMeResponse, HouseholdRecord, SignInResponse } from '../api/client'
import { ApiError, isNetworkError } from '../api/client'
import {
  createHousehold,
  getHouseholdMe,
  joinHousehold,
  signIn as apiSignIn,
  signOut as apiSignOut,
  verifySignInCode as apiVerifySignInCode,
} from '../api/client'
import { appStore } from '../domain/store'
import { AuthContext } from './context'

const CONNECTION_ERROR_MESSAGE = 'Kunne ikke oprette forbindelse til serveren.'
const SESSION_EXPIRED_MESSAGE = 'Din login-session er udløbet. Log ind igen.'
const EMAIL_NOT_ALLOWED_MESSAGE = 'Din e-mail er ikke længere tilladt.'
const OFFLINE_RETRY_INTERVAL_MS = 30_000

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated'

interface SessionFailure {
  kind: 'no_household' | 'auth' | 'network' | 'unknown'
  user?: HouseholdMeResponse['user']
  message?: string
}

function classifySessionError(error: unknown): SessionFailure {
  if (error instanceof ApiError) {
    if (error.code === 'no_household') {
      return { kind: 'no_household', user: error.user }
    }

    if (error.code === 'unauthorized') {
      return { kind: 'auth' }
    }

    if (error.code === 'email_not_allowed') {
      return { kind: 'auth', message: EMAIL_NOT_ALLOWED_MESSAGE }
    }

    if (isNetworkError(error) || error.code === 'server_error') {
      return { kind: 'network' }
    }

    return { kind: 'unknown' }
  }

  if (error instanceof Error) {
    if (error.message === 'no_household') return { kind: 'no_household' }
    if (error.message === 'unauthorized') return { kind: 'auth' }
    if (error.message === 'email_not_allowed') {
      return { kind: 'auth', message: EMAIL_NOT_ALLOWED_MESSAGE }
    }
  }

  return { kind: 'unknown' }
}

function hasLocalHouseholdSession(): boolean {
  return Boolean(appStore.getSyncMeta().householdId)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<HouseholdMeResponse['user'] | null>(null)
  const [household, setHousehold] = useState<HouseholdRecord | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const statusRef = useRef<AuthStatus>('loading')
  const justVerifiedRef = useRef(false)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  function clearAuthError(): void {
    setAuthError(null)
  }

  function applySession(response: HouseholdMeResponse): void {
    justVerifiedRef.current = false
    setUser(response.user)
    setHousehold(response)
    setStatus('authenticated')
    setAuthError(null)
    setIsOffline(false)
  }

  function applySessionFailure(failure: SessionFailure): void {
    if (failure.kind === 'no_household') {
      setStatus('authenticated')
      setUser(failure.user ?? null)
      setHousehold(null)
      setAuthError(null)
      setIsOffline(false)
      return
    }

    if (failure.kind === 'auth') {
      const wasAuthenticated = statusRef.current === 'authenticated'
      setStatus('unauthenticated')
      setUser(null)
      setHousehold(null)
      setIsOffline(false)
      setAuthError(failure.message ?? (wasAuthenticated ? SESSION_EXPIRED_MESSAGE : null))
      return
    }

    if (failure.kind === 'network') {
      if (statusRef.current === 'authenticated' || justVerifiedRef.current || hasLocalHouseholdSession()) {
        setStatus('authenticated')
        setIsOffline(true)
        setAuthError(null)
        return
      }

      setStatus('unauthenticated')
      setUser(null)
      setHousehold(null)
      setAuthError(CONNECTION_ERROR_MESSAGE)
      return
    }

    setStatus('unauthenticated')
    setUser(null)
    setHousehold(null)
    setAuthError(CONNECTION_ERROR_MESSAGE)
  }

  async function refresh(): Promise<void> {
    try {
      applySession(await getHouseholdMe())
    } catch (error) {
      if (!(error instanceof ApiError) && !(error instanceof Error)) {
        console.error('Auth refresh failed:', error)
      }
      applySessionFailure(classifySessionError(error))
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadSession(): Promise<void> {
      try {
        const response = await getHouseholdMe()
        if (cancelled) return
        applySession(response)
      } catch (error) {
        if (cancelled) return
        if (!(error instanceof ApiError) && !(error instanceof Error)) {
          console.error('Session load failed:', error)
        }
        applySessionFailure(classifySessionError(error))
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [])

  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    if (!isOffline) return

    const retry = (): void => {
      void refreshRef.current()
    }

    window.addEventListener('online', retry)
    const interval = window.setInterval(retry, OFFLINE_RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', retry)
      window.clearInterval(interval)
    }
  }, [isOffline])

  async function signIn(email: string): Promise<SignInResponse> {
    return apiSignIn(email)
  }

  async function verifySignInCode(email: string, code: string): Promise<void> {
    await apiVerifySignInCode(email, code)
    justVerifiedRef.current = true
    await refresh()
  }

  async function signOut(): Promise<void> {
    justVerifiedRef.current = false
    setStatus('unauthenticated')
    setUser(null)
    setHousehold(null)
    setIsOffline(false)
    setAuthError(null)

    try {
      await apiSignOut()
    } catch (error) {
      console.error('Sign-out request failed:', error)
    }
  }

  async function createHouseholdForUser(state?: HouseholdRecord['state']): Promise<HouseholdRecord> {
    const next = await createHousehold(state)
    setStatus('authenticated')
    setUser((current) => current)
    setHousehold(next)
    setIsOffline(false)
    return next
  }

  async function joinHouseholdForUser(code: string): Promise<HouseholdRecord> {
    const next = await joinHousehold(code)
    setStatus('authenticated')
    setUser((current) => current)
    setHousehold(next)
    setIsOffline(false)
    return next
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        household,
        authError,
        isOffline,
        signIn,
        verifySignInCode,
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
