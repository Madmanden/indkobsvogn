import type { AppState, SyncableState } from '../domain/models'
import { resolveSelectedStoreId } from '../utils/selected-store'

const API_BASE_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') ?? ''
const API_REQUEST_TIMEOUT_MS = 10_000

export interface AuthUser {
  id: string
  email: string
}

export interface Household {
  id: string
  code: string
  version: number
  createdAt: number
  updatedAt: number
}

export interface HouseholdMember {
  id: string
  householdId: string
  email: string
  createdAt: number
}

export interface HouseholdRecord {
  household: Household
  state: SyncableState
  members: HouseholdMember[]
}

export interface HouseholdMeResponse extends HouseholdRecord {
  user: AuthUser
}

export interface StateResponse {
  state: SyncableState
  version: number
}

export interface PushStateSuccess {
  ok: true
  state: SyncableState
  version: number
}

export interface PushStateConflict {
  ok: false
  conflict: true
  state: SyncableState
  version: number
}

export interface PushStateError {
  ok: false
  conflict: false
  status: number
  message: string
}

export type PushStateResult = PushStateSuccess | PushStateConflict | PushStateError

export class ApiError extends Error {
  readonly code: string
  readonly status?: number
  readonly responseMessage?: string
  readonly user?: AuthUser

  constructor(
    code: string,
    options: { status?: number; responseMessage?: string; user?: AuthUser; message?: string } = {},
  ) {
    super(options.message ?? code)
    this.name = 'ApiError'
    this.code = code
    this.status = options.status
    this.responseMessage = options.responseMessage
    this.user = options.user
  }
}

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'network_error' || error.code === 'request_timeout')
  )
}

export function isAuthError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'unauthorized' || error.code === 'email_not_allowed')
  )
}

export interface SignInResponse {
  ok: true
  verificationUrl?: string
  backupCode?: string
  deliveryStatus: 'sent' | 'local' | 'fallback'
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

function createTimeoutError(path: string): ApiError {
  return new ApiError('request_timeout', { message: `request_timeout:${path}` })
}

async function fetchWithTimeout(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(createTimeoutError(path))
  }, API_REQUEST_TIMEOUT_MS)

  try {
    return await fetch(buildUrl(path), {
      credentials: 'include',
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const reason = controller.signal.reason
      if (reason instanceof Error) {
        throw reason
      }

      throw createTimeoutError(path)
    }

    if (error instanceof TypeError) {
      throw new ApiError('network_error', { message: `network_error:${path}` })
    }

    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(path, init)

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    const code = typeof error?.error === 'string' ? error.error : response.statusText || 'server_error'
    throw new ApiError(code, {
      status: response.status,
      responseMessage: typeof error?.message === 'string' ? error.message : undefined,
    })
  }

  return readJson<T>(response)
}

async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(path, init)
}

export function toSyncableState(state: AppState): SyncableState {
  const { selectedStoreId, isShopping, currentSequence, list, ...syncable } = state
  void selectedStoreId
  void isShopping
  void currentSequence
  void list
  return syncable
}

export function mergeServerStateIntoLocal(localState: AppState, serverState: SyncableState): AppState {
  return {
    ...localState,
    ...serverState,
    list: localState.list,
    selectedStoreId: resolveSelectedStoreId(serverState.stores, localState.selectedStoreId),
    isShopping: localState.isShopping,
    currentSequence: localState.currentSequence,
  }
}

export async function signIn(email: string): Promise<SignInResponse> {
  return request<SignInResponse>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function verifySignInCode(email: string, code: string): Promise<void> {
  const response = await requestRaw('/api/auth/sign-in/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(error?.error ?? 'invalid_code', { status: response.status })
  }
}

export async function signOut(): Promise<void> {
  await requestRaw('/api/auth/sign-out', { method: 'POST' })
}

export async function getHouseholdMe(): Promise<HouseholdMeResponse> {
  const response = await requestRaw('/api/household/me', { method: 'GET' })

  if (response.status === 404) {
    const payload = (await response.json().catch(() => null)) as { user?: AuthUser } | null
    throw new ApiError('no_household', { status: 404, user: payload?.user })
  }

  if (response.status === 401 || response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    if (payload?.error === 'email_not_allowed') {
      throw new ApiError('email_not_allowed', { status: response.status })
    }

    throw new ApiError('unauthorized', { status: response.status })
  }

  if (!response.ok) {
    throw new ApiError('server_error', { status: response.status })
  }

  return readJson<HouseholdMeResponse>(response)
}

export async function createHousehold(state?: SyncableState): Promise<HouseholdRecord> {
  return request<HouseholdRecord>('/api/household/create', {
    method: 'POST',
    body: JSON.stringify({ state: state ?? null }),
  })
}

export async function joinHousehold(code: string): Promise<HouseholdRecord> {
  return request<HouseholdRecord>('/api/household/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function fetchState(): Promise<StateResponse> {
  return request<StateResponse>('/api/state', { method: 'GET' })
}

export async function pushState(state: SyncableState, version: number): Promise<PushStateResult> {
  const response = await requestRaw('/api/state', {
    method: 'PUT',
    body: JSON.stringify({ state, version }),
  })

  if (response.status === 409) {
    const payload = (await response.json()) as { state: SyncableState; version: number }
    return {
      ok: false,
      conflict: true,
      state: payload.state,
      version: payload.version,
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      conflict: false,
      status: response.status,
      message: response.statusText,
    }
  }

  const payload = (await response.json()) as { state: SyncableState; version: number }
  return {
    ok: true,
    state: payload.state,
    version: payload.version,
  }
}
