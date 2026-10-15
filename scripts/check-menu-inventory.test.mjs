/**
 * Тесты гейта `scripts/check-menu-inventory.mjs` (пункт 1 разбора аудитов).
 *
 * Правило: гейт обязан быть (а) зелёным на настоящем репозитории, (б) красным
 * при каждой реальной поломке пункта меню — битый маршрут, отсутствующий ключ
 * перевода, чужая роль, флаг без чтения через useFeature, дубликат, переименованный
 * массив (иначе гейт «проверяет пустоту» и молча зелёный).
 */

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadMenuModel, auditMenu } from './check-menu-inventory.mjs'
import {
  collectRoutes,
  collectEmployeeRoles,
  extractArrayBody,
  resolveKey,
  parseMenuObject,
} from './menu-inventory.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function kinds(findings) {
  return findings.map((f) => f.kind)
}

describe('гейт menu-inventory: настоящий репозиторий', () => {
  const model = loadMenuModel(ROOT)

  it('не находит ни одной поломки на текущем коде', () => {
    expect(auditMenu(model)).toEqual([])
  })

  it('видит оба источника меню и не перепутал их', () => {
    const files = new Set(model.menu.items.map((i) => i.file))
    expect(files.has('src/components/layout/sidebar.tsx')).toBe(true)
    expect(files.has('src/components/layout/admin-layout.tsx')).toBe(true)
    expect(model.menu.missing).toEqual([])
    expect(model.menu.items.length).toBeGreaterThan(20)
  })

  it('маршруты разворачивает с учётом вложенности и index-роутов', () => {
    for (const p of ['/', '/search', '/tickets', '/tickets/new', '/team', '/profile', '/admin', '/admin/users', '/admin/rbac', '/admin/custom-fields']) {
      expect(model.routes.has(p)).toBe(true)
    }
  })

  it('роли и флаги берёт из кода (не из собственной константы)', () => {
    expect(model.roles).toEqual(['requester', 'agent', 'senior_agent', 'admin', 'super_admin'])
    expect(model.flags.has('org_chart')).toBe(true)
  })
})

describe('гейт menu-inventory: ловит поломки', () => {
  const fresh = () => structuredClone(loadMenuModel(ROOT))

  it('битый маршрут пункта меню — route', () => {
    const m = fresh()
    m.menu.items[1].to = '/no-such-page'
    expect(kinds(auditMenu(m))).toContain('route')
  })

  it('ключ перевода, которого нет — i18n', () => {
    const m = fresh()
    m.menu.items[1].labelKey = 'nav.noSuchKey'
    expect(kinds(auditMenu(m))).toContain('i18n')
  })

  it('роль вне EmployeeRole — role', () => {
    const m = fresh()
    m.menu.items[1].roles = ['god_mode']
    expect(kinds(auditMenu(m))).toContain('role')
  })

  it('пункт сайдбара без ролей — roles-empty', () => {
    const m = fresh()
    m.menu.items[1].roles = []
    expect(kinds(auditMenu(m))).toContain('roles-empty')
  })

  it('флаг без чтения через useFeature — flag-use', () => {
    const m = fresh()
    const file = 'src/components/layout/sidebar.tsx'
    m.sources[file] = m.sources[file].replace("useFeature('org_chart')", "useFeature('other')")
    expect(kinds(auditMenu(m))).toContain('flag-use')
  })

  it('неизвестный флаг — flag', () => {
    const m = fresh()
    const item = m.menu.items.find((i) => i.feature)
    item.feature = 'no_such_flag'
    expect(kinds(auditMenu(m))).toContain('flag')
  })

  it('дубликат пункта в одном массиве — duplicate', () => {
    const m = fresh()
    m.menu.items.splice(2, 0, { ...m.menu.items[1] })
    expect(kinds(auditMenu(m))).toContain('duplicate')
  })

  it('переименованный массив — source (не «ноль пунктов»)', () => {
    const m = fresh()
    m.menu.missing = ['src/components/layout/sidebar.tsx:navItems']
    expect(kinds(auditMenu(m))).toContain('source')
  })
})

describe('парсер меню: чистые функции', () => {
  it('resolveKey идёт по точкам и не падает на отсутствии', () => {
    const json = { nav: { dashboard: 'Обзор' } }
    expect(resolveKey(json, 'nav.dashboard')).toBe('Обзор')
    expect(resolveKey(json, 'nav.missing')).toBeUndefined()
    expect(resolveKey(json, 'a.b.c')).toBeUndefined()
  })

  it('extractArrayBody находит тело массива с вложенными скобками', () => {
    const text = `const navItems = [\n  { to: '/', roles: ['a', 'b'] },\n]\nconst other = []\n`
    const found = extractArrayBody(text, 'navItems')
    expect(found).not.toBeNull()
    expect(found.body).toContain("to: '/'")
    expect(extractArrayBody(text, 'renamed')).toBeNull()
  })

  it('parseMenuObject вытаскивает to/labelKey/roles/feature', () => {
    const obj = `{ to: '/team', icon: Network, labelKey: 'nav.team', roles: ['admin', 'agent'], feature: 'org_chart' }`
    expect(parseMenuObject(obj)).toEqual({
      to: '/team',
      labelKey: 'nav.team',
      roles: ['admin', 'agent'],
      feature: 'org_chart',
    })
    expect(parseMenuObject(`{ to: '/x', labelKey: 'k' }`)).toEqual({
      to: '/x',
      labelKey: 'k',
      roles: [],
      feature: undefined,
    })
  })

  it('collectRoutes разворачивает относительные и index-маршруты', () => {
    const text = `
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/new" element={<NewTicket />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Admin />} />
          <Route path="rbac" element={<AdminRbac />} />
        </Route>
      </Routes>
    `
    const routes = collectRoutes(text)
    expect([...routes].sort()).toEqual(['/', '/admin', '/admin/rbac', '/login', '/tickets', '/tickets/new'].sort())
  })

  it('collectEmployeeRoles читает union-тип', () => {
    expect(collectEmployeeRoles(`export type EmployeeRole = 'a' | 'b' | 'c'`)).toEqual(['a', 'b', 'c'])
    expect(collectEmployeeRoles('export const x = 1')).toBeNull()
  })
})
