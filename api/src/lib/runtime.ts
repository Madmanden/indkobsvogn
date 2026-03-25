export interface PreparedStatementLike {
  bind: (...values: unknown[]) => PreparedStatementLike
  first: <T = Record<string, unknown>>() => Promise<T | null>
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>
  run: () => Promise<{ success: boolean; changes?: number }>
}

export interface DatabaseLike {
  prepare: (sql: string) => PreparedStatementLike
  exec?: (sql: string) => Promise<void> | void
}

export interface Env {
  DB: DatabaseLike
  FRONTEND_URL?: string
  RESEND_API_KEY?: string
  FROM_EMAIL?: string
  SESSION_COOKIE_NAME?: string
  ALLOWED_EMAILS?: string
}

export interface AuthenticatedUser {
  id: string
  email: string
}
