// TOTP/2FA хелперы на базе otplib v12 (RFC 6238).
// Секрет хранится в таблице user_totp, проверка кода — verifySync (constant-time).
import { generateSecret, generateURI, verifySync } from 'otplib'

const ISSUER = 'Service Desk'

export function generateTotpSecret() {
  return generateSecret()
}

/** otpauth:// URI для QR-кода в Profile. */
export function totpUri(secret, email) {
  return generateURI({ issuer: ISSUER, label: email || '', secret })
}

/** Проверка 6-значного кода (допускаем смещение ±30с). */
export function verifyTotp(secret, token) {
  if (!secret || !token) return false
  try {
    const result = verifySync({ secret, token: String(token).trim(), epochTolerance: 30 })
    return result?.valid === true
  } catch {
    return false
  }
}