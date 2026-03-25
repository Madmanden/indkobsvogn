type ApiErrorLike = Error & { responseMessage?: string }

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  missing_email: 'Skriv en e-mailadresse først.',
  email_not_allowed: 'Den e-mail er ikke på tilladelseslisten.',
  too_many_requests: 'Der er sendt for mange login-forsøg. Vent et øjeblik og prøv igen.',
  mail_delivery_failed: 'Kunne ikke sende login-linket lige nu. Prøv igen om lidt.',
  sign_in_failed: 'Kunne ikke oprette login-linket lige nu. Prøv igen om lidt.',
}

export function getLoginErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = error.message
    const responseMessage = (error as ApiErrorLike).responseMessage

    if (code.startsWith('request_timeout:')) {
      return 'Kunne ikke få kontakt med serveren lige nu. Prøv igen om lidt.'
    }

    if (code in LOGIN_ERROR_MESSAGES) {
      if ((code === 'mail_delivery_failed' || code === 'sign_in_failed') && typeof responseMessage === 'string' && responseMessage.trim()) {
        return responseMessage
      }

      return LOGIN_ERROR_MESSAGES[code]
    }

    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage
    }
  }

  return 'Kunne ikke sende login-linket.'
}
