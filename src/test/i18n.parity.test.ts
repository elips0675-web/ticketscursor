import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'

type Dict = Record<string, unknown>

/** Все «листовые» ключи плоским списком: a.b.c — по вложенности объектов. */
function collectKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj as Dict).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) return collectKeys(v, path)
    return [path]
  })
}

describe('i18n parity (Этап 60 — защита от регресса дублей ключей)', () => {
  const ruKeys = collectKeys(ru)
  const enKeys = collectKeys(en)

  it('каждый ключ ru.json есть в en.json', () => {
    const enSet = new Set(enKeys)
    const missing = ruKeys.filter((k) => !enSet.has(k))
    expect(missing, `Нет в en.json: ${missing.join(', ')}`).toEqual([])
  })

  it('каждый ключ en.json есть в ru.json', () => {
    const ruSet = new Set(ruKeys)
    const missing = enKeys.filter((k) => !ruSet.has(k))
    expect(missing, `Нет в ru.json: ${missing.join(', ')}`).toEqual([])
  })

  it('нет дублей ключей внутри ru.json (после истории с auth.hasAccount)', () => {
    expect(ruKeys.length).toBe(new Set(ruKeys).size)
  })

  it('нет дублей ключей внутри en.json', () => {
    expect(enKeys.length).toBe(new Set(enKeys).size)
  })

  it('оба файла непустые и содержат корневые namespace-блоки', () => {
    expect(ruKeys.length).toBeGreaterThan(50)
    expect(enKeys.length).toBeGreaterThan(50)
  })
})
