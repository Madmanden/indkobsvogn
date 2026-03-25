/**
 * Simple rate limiter using D1 for distributed rate limiting.
 *
 * Tracks attempts by key (e.g., email or IP) with sliding window expiry.
 */
import type { DatabaseLike } from './runtime'

interface RateLimitRow {
  key: string
  attempts: number
  window_start: number
}

const WINDOW_MS = 60 * 1000 // 1 minute window
const MAX_ATTEMPTS = 5 // Max 5 sign-in attempts per minute per email

export async function checkRateLimit(db: DatabaseLike, key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  // Clean up expired entries and get current count
  await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(windowStart)
    .run()

  const row = await db
    .prepare('SELECT key, attempts, window_start FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<RateLimitRow>()

  const currentAttempts = row?.attempts ?? 0
  const resetAt = row ? row.window_start + WINDOW_MS : now + WINDOW_MS

  if (currentAttempts >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - currentAttempts - 1, resetAt }
}

export async function recordAttempt(db: DatabaseLike, key: string): Promise<void> {
  const now = Date.now()

  // Upsert: insert or increment
  await db
    .prepare(
      `INSERT INTO rate_limits (key, attempts, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1`,
    )
    .bind(key, now)
    .run()
}
