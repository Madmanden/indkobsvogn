function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function createId(prefix: string): string {
  const bytes = randomBytes(16)
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${hex}`
}

export function createToken(length = 32): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = randomBytes(length)
  let output = ''

  for (const byte of bytes) {
    output += alphabet[byte % alphabet.length]
  }

  return output
}

export function createHouseholdCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const digits = '0123456789'
  const bytes = randomBytes(6)

  return (
    `${letters[bytes[0] % letters.length]}${letters[bytes[1] % letters.length]}` +
    `${letters[bytes[2] % letters.length]}${letters[bytes[3] % letters.length]}-` +
    `${digits[bytes[4] % digits.length]}${digits[bytes[5] % digits.length]}`
  )
}
