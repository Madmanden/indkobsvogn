import { describe, expect, it } from 'vitest'
import { getLoginErrorMessage } from '../src/components/loginErrors'

describe('getLoginErrorMessage', () => {
  it('maps rate-limit failures to a friendly message', () => {
    expect(getLoginErrorMessage(new Error('too_many_requests'))).toBe(
      'Der er sendt for mange login-forsøg. Vent et øjeblik og prøv igen.',
    )
  })

  it('uses the backend response message for mail delivery failures when present', () => {
    const error = new Error('mail_delivery_failed') as Error & { responseMessage?: string }
    error.responseMessage = 'Mailtjenesten svarede ikke. Prøv igen om lidt.'

    expect(getLoginErrorMessage(error)).toBe('Mailtjenesten svarede ikke. Prøv igen om lidt.')
  })

  it('treats request timeouts as a server connectivity problem', () => {
    expect(getLoginErrorMessage(new Error('request_timeout:/api/auth/sign-in'))).toBe(
      'Kunne ikke få kontakt med serveren lige nu. Prøv igen om lidt.',
    )
  })
})
