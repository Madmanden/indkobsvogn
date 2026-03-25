import { normalizeEmail } from './http'

function parseAllowedEmails(raw?: string): Set<string> {
  const entries = raw
    ?.split(/[,;\n]/)
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.length > 0)

  return new Set(entries ?? [])
}

export function isEmailAllowed(email: string, rawAllowedEmails?: string): boolean {
  const allowedEmails = parseAllowedEmails(rawAllowedEmails)
  if (allowedEmails.size === 0) return true

  return allowedEmails.has(normalizeEmail(email))
}

