export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0))

  for (let i = 0; i <= m; i += 1) dp[i][0] = i
  for (let j = 0; j <= n; j += 1) dp[0][j] = j

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }

  return dp[m][n]
}

export function normalizeItemName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function similarity(a: string, b: string): number {
  const aLower = normalizeItemName(a)
  const bLower = normalizeItemName(b)
  const maxLength = Math.max(aLower.length, bLower.length)
  if (!maxLength) return 1

  return 1 - levenshtein(aLower, bLower) / maxLength
}
