export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true
  }

  const domException = error as DOMException
  return domException.code === 22 || domException.code === 1014
}
