// Решение о доверии прокси — управляется явно (TRUST_PROXY=1 за nginx),
// чтобы X-Forwarded-For нельзя было подделать при прямом доступе.
export function getTrustProxySetting() {
  const v = process.env.TRUST_PROXY
  return v === '1' || v === 'true' ? 1 : false
}