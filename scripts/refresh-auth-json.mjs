/**
 * Обновление `auth.json` через dev-login — ЕДИНЫЙ механизм для всех входов.
 *
 * JWT от dev-login живёт ~15 минут: протухший токен в `auth.json` даёт 401 на всех
 * публичных страницах (дефект 21.10.2026 — check-console FAILED на 14 страницах при
 * исправном коде). Правило живёт здесь, а не копируется в потребителях:
 *   — `scripts/ci-check-console.mjs` — жёсткий режим (`strict: true`): dev-login недоступен → падаем;
 *   — `check-console.mjs` — мягкий режим: обновление не удалось → идём со старым токеном.
 *
 * Origin берётся из BASE_URL обхода: localStorage-токен хранится под origin страницы,
 * поэтому origin из auth.json обязан совпадать с адресом, который открывает Playwright.
 */

import { writeFileSync } from 'node:fs'

export const DEFAULT_AUTH_ORIGIN = 'http://localhost:5173'

export function buildAuthState(token, origin = DEFAULT_AUTH_ORIGIN) {
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: 'token', value: token },
          {
            name: 'user',
            value: JSON.stringify({
              id: 1,
              name: 'Алексей Петров',
              email: 'alexey@example.com',
              role: 'super_admin',
            }),
          },
        ],
      },
    ],
  }
}

export async function refreshAuthJson({
  apiUrl = 'http://localhost:4000',
  authPath,
  origin = DEFAULT_AUTH_ORIGIN,
  strict = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!authPath) throw new Error('refreshAuthJson: не передан authPath')

  try {
    const res = await fetchImpl(`${apiUrl}/api/auth/dev-login`, { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    const token = body?.data?.token || body?.token
    if (!res.ok || !token) throw new Error(`dev-login не дал токен: HTTP ${res.status}`)

    writeFileSync(authPath, JSON.stringify(buildAuthState(token, origin)))
    return { refreshed: true, token }
  } catch (err) {
    if (strict) throw err
    return { refreshed: false, token: null, error: err }
  }
}
