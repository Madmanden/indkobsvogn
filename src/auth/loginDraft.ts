export interface LoginDraft {
  email: string
  code: string
  linkSent: boolean
}

const LOGIN_DRAFT_KEY = 'indkobsvogn-login-draft'

export function readLoginDraft(): LoginDraft | null {
  try {
    const raw = sessionStorage.getItem(LOGIN_DRAFT_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<LoginDraft> | null
    if (!parsed || typeof parsed.email !== 'string' || parsed.linkSent !== true) return null

    return {
      email: parsed.email,
      code: typeof parsed.code === 'string' ? parsed.code : '',
      linkSent: true,
    }
  } catch {
    return null
  }
}

export function writeLoginDraft(draft: LoginDraft): void {
  try {
    sessionStorage.setItem(LOGIN_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // sessionStorage may be unavailable; the login flow still works without a draft
  }
}

export function clearLoginDraft(): void {
  try {
    sessionStorage.removeItem(LOGIN_DRAFT_KEY)
  } catch {
    // ignore
  }
}

export function isLoginInProgress(): boolean {
  return readLoginDraft() !== null
}
