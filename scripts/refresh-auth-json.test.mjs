/**
 * Тесты общего механизма обновления `auth.json` (`scripts/refresh-auth-json.mjs`).
 *
 * Правило: «обновить протухший токен перед обходом» живёт в ОДНОМ модуле. Раньше
 * было две копии (своя в `scripts/ci-check-console.mjs`, своя в `check-console.mjs`),
 * и копия в корне осталась незакоммиченной — правило разъехалось с кодом.
 *
 * Тест держит контракт:
 *   — `buildAuthState` отдаёт форму storageState, которую понимает Playwright
 *     (origin страницы + localStorage с токеном);
 *   — `refreshAuthJson` пишет файл и возвращает `refreshed: true`;
 *   — жёсткий режим (`strict`) падает на неудачном dev-login, мягкий — не падает;
 *   — вызов без `authPath` отвергается ДО сети (иначе запись в `undefined`).
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildAuthState, refreshAuthJson, DEFAULT_AUTH_ORIGIN } from './refresh-auth-json.mjs'

function tmpAuthPath() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sd-auth-'))
  return path.join(dir, 'auth.json')
}

function fakeFetch({ ok = true, status = 200, body = {} } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => body,
  })
}

describe('buildAuthState', () => {
  it('кладёт токен в localStorage под origin страницы', () => {
    const state = buildAuthState('tok-123', 'http://localhost:5173')

    expect(state.cookies).toEqual([])
    expect(state.origins).toHaveLength(1)
    expect(state.origins[0].origin).toBe('http://localhost:5173')
    const storage = state.origins[0].localStorage
    expect(storage.find((e) => e.name === 'token').value).toBe('tok-123')
    expect(JSON.parse(storage.find((e) => e.name === 'user').value).role).toBe('super_admin')
  })

  it('origin по умолчанию — стенд 5173, но он подставляется', () => {
    expect(buildAuthState('t').origins[0].origin).toBe(DEFAULT_AUTH_ORIGIN)
    expect(buildAuthState('t', 'http://localhost:4173').origins[0].origin).toBe('http://localhost:4173')
  })
})

describe('refreshAuthJson', () => {
  it('обновляет auth.json и возвращает refreshed=true', async () => {
    const authPath = tmpAuthPath()

    const res = await refreshAuthJson({
      apiUrl: 'http://localhost:4000',
      authPath,
      fetchImpl: fakeFetch({ body: { data: { token: 'tok-abc' } } }),
    })

    expect(res.refreshed).toBe(true)
    expect(res.token).toBe('tok-abc')
    expect(existsSync(authPath)).toBe(true)
    const written = JSON.parse(readFileSync(authPath, 'utf8'))
    expect(written.origins[0].localStorage.find((e) => e.name === 'token').value).toBe('tok-abc')
  })

  it('принимает токен из корня ответа (body.token)', async () => {
    const authPath = tmpAuthPath()

    const res = await refreshAuthJson({
      apiUrl: 'http://localhost:4000',
      authPath,
      fetchImpl: fakeFetch({ body: { token: 'tok-root' } }),
    })

    expect(res.refreshed).toBe(true)
    expect(res.token).toBe('tok-root')
  })

  it('жёсткий режим падает, когда dev-login не дал токен', async () => {
    await expect(
      refreshAuthJson({
        apiUrl: 'http://localhost:4000',
        authPath: tmpAuthPath(),
        strict: true,
        fetchImpl: fakeFetch({ ok: false, status: 500, body: {} }),
      }),
    ).rejects.toThrow(/dev-login не дал токен/)
  })

  it('мягкий режим не падает и честно говорит, что не обновил', async () => {
    const res = await refreshAuthJson({
      apiUrl: 'http://localhost:4000',
      authPath: tmpAuthPath(),
      fetchImpl: fakeFetch({ ok: false, status: 500, body: {} }),
    })

    expect(res.refreshed).toBe(false)
    expect(res.token).toBeNull()
    expect(res.error).toBeInstanceOf(Error)
  })

  it('мягкий режим переживает недоступный API (сервер не поднят)', async () => {
    const res = await refreshAuthJson({
      apiUrl: 'http://localhost:4000',
      authPath: tmpAuthPath(),
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED')
      },
    })

    expect(res.refreshed).toBe(false)
    expect(res.error.message).toContain('ECONNREFUSED')
  })

  it('вызов без authPath отвергается до обращения к сети', async () => {
    let called = false
    await expect(
      refreshAuthJson({
        apiUrl: 'http://localhost:4000',
        fetchImpl: async () => {
          called = true
          return { ok: true, status: 200, json: async () => ({ data: { token: 't' } }) }
        },
      }),
    ).rejects.toThrow(/authPath/)
    expect(called).toBe(false)
  })
})
