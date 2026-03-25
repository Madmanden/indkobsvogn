import { createContext } from 'react'
import type { HouseholdMeResponse, HouseholdRecord, SignInResponse } from '../api/client'

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated'

export interface AuthContextValue {
  status: AuthStatus
  user: HouseholdMeResponse['user'] | null
  household: HouseholdRecord | null
  authError: string | null
  signIn: (email: string) => Promise<SignInResponse>
  signOut: () => Promise<void>
  createHousehold: (state?: HouseholdRecord['state']) => Promise<HouseholdRecord>
  joinHousehold: (code: string) => Promise<HouseholdRecord>
  refresh: () => Promise<void>
  clearAuthError: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
