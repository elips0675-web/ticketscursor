// Единый инвентарь пунктов меню + связанные с ними факты.
//
// Зачем: список страниц для `check-console.mjs` (17 фиксированных путей) и
// правило «пункт меню живой» держались руками и протухали молча — пункт меню мог
// ссылаться на несуществующий маршрут, на ключ перевода, которого нет, или
// гейтиться флагом, который лэйаут не читает (пункт не появится никогда).
//
// Источник истины — сами TSX-файлы меню; модуль ничего не хардкодит:
//   • пункты меню   — `src/components/layout/sidebar.tsx`, `…/admin-layout.tsx`
//   • маршруты      — `src/App.tsx` (с учётом вложенности и index-роутов)
//   • роли          — тип `EmployeeRole` (`src/types/index.ts`)
//   • флаги фич     — миграции `server/migrations/*.js` (таблица `feature_flags`)
//   • переводы      — `src/i18n/locales/ru.json`, `…/en.json`

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const MENU_SOURCES = [
  { file: 'src/components/layout/sidebar.tsx', arrays: ['navItems', 'bottomItems'] },
  { file: 'src/components/layout/admin-layout.tsx', arrays: ['adminNavItems'] },
]

export const ROUTES_FILE = 'src/App.tsx'
export const ROLES_FILE = 'src/types/index.ts'
export const LOCALE_FILES = ['src/i18n/locales/ru.json', 'src/i18n/locales/en.json']
export const MIGRATIONS_DIR = 'server/migrations'

// Ключ перевода вида `nav.dashboard` → значение в дереве JSON.
export function resolveKey(json, dotPath) {
  let node = json
  for (const part of dotPath.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined
    node = node[part]
  }
  return node
}

// Позиция закрывающей скобки для открывающей на индексе openIndex.
// Учитывает строковые литералы ('", `), чтобы скобки внутри текста не считались.
export function matchBracket(text, openIndex) {
  const open = text[openIndex]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let quote = null
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Тело массива `const <name> = [ … ]` вместе с индексом первого символа тела.
export function extractArrayBody(text, name) {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[`)
  const m = re.exec(text)
  if (!m) return null
  const openIndex = text.indexOf('[', m.index)
  const closeIndex = matchBracket(text, openIndex)
  if (closeIndex === -1) return null
  return { body: text.slice(openIndex + 1, closeIndex), start: openIndex + 1 }
}

function topLevelObjects(body) {
  const out = []
  let i = 0
  while (i < body.length) {
    if (body[i] === '{') {
      const end = matchBracket(body, i)
      if (end === -1) break
      out.push({ text: body.slice(i, end + 1), at: i })
      i = end + 1
    } else i++
  }
  return out
}

export function parseMenuObject(obj) {
  const to = /to:\s*'([^']+)'/.exec(obj)?.[1]
  const labelKey = /labelKey:\s*'([^']+)'/.exec(obj)?.[1]
  const rolesRaw = /roles:\s*\[([^\]]*)\]/.exec(obj)?.[1]
  const roles = rolesRaw
    ? rolesRaw
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    : []
  const feature = /feature:\s*'([^']+)'/.exec(obj)?.[1]
  return { to, labelKey, roles, feature }
}

// Все пункты меню из TSX-файлов. Возвращает и список «не найденных» массивов:
// переименованный массив — это не «ноль пунктов», а сломанный гейт.
export function collectMenu(root) {
  const items = []
  const missing = []
  const sources = {}
  for (const source of MENU_SOURCES) {
    const text = readFileSync(join(root, source.file), 'utf8')
    sources[source.file] = text
    for (const name of source.arrays) {
      const found = extractArrayBody(text, name)
      if (!found) {
        missing.push(`${source.file}:${name}`)
        continue
      }
      for (const obj of topLevelObjects(found.body)) {
        const item = parseMenuObject(obj.text)
        item.file = source.file
        item.array = name
        items.push(item)
      }
    }
  }
  return { items, missing, sources }
}

function findTagEnd(text, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0) return i
  }
  return -1
}

// Эффективные пути маршрутов из `src/App.tsx`: вложенные `<Route path="x">`
// разворачиваются в полный путь, `index` даёт путь родителя.
export function collectRoutes(text) {
  const paths = new Set()
  const stack = ['']
  const tagRe = /<(\/?)Route\b/g
  let m
  while ((m = tagRe.exec(text)) !== null) {
    if (m[1] === '/') {
      if (stack.length > 1) stack.pop()
      continue
    }
    const end = findTagEnd(text, m.index)
    if (end === -1) break
    const tag = text.slice(m.index, end + 1)
    tagRe.lastIndex = end + 1
    const mount = stack[stack.length - 1]
    const path = /path="([^"]*)"/.exec(tag)?.[1]
    const isIndex = /\sindex[\s/>]/.test(tag)
    let effective
    if (isIndex) effective = mount || '/'
    else if (path === undefined) effective = mount
    else if (path.startsWith('/')) effective = path
    else effective = mount === '' ? `/${path}` : `${mount}/${path}`
    if (effective) paths.add(effective)
    if (!/\/>\s*$/.test(tag.trim())) stack.push(effective)
  }
  return paths
}

// Роли из union-типа `EmployeeRole` — единственный источник истины фронта.
export function collectEmployeeRoles(text) {
  const m = /export\s+type\s+EmployeeRole\s*=\s*([^\n]+)/.exec(text)
  if (!m) return null
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

// Флаги фич из миграций — только из файлов, работающих с таблицей `feature_flags`.
export function collectFeatureFlags(root) {
  const dir = join(root, MIGRATIONS_DIR)
  const flags = new Set()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js')) continue
    const text = readFileSync(join(dir, file), 'utf8')
    if (!text.includes('feature_flags')) continue
    for (const m of text.matchAll(/key:\s*'([a-z0-9_]+)'/g)) flags.add(m[1])
  }
  return flags
}

export function loadMenuModel(root) {
  const menu = collectMenu(root)
  const routes = collectRoutes(readFileSync(join(root, ROUTES_FILE), 'utf8'))
  const roles = collectEmployeeRoles(readFileSync(join(root, ROLES_FILE), 'utf8'))
  const flags = collectFeatureFlags(root)
  const locales = {}
  for (const file of LOCALE_FILES) locales[file] = JSON.parse(readFileSync(join(root, file), 'utf8'))
  return { menu, routes, roles, flags, locales, sources: menu.sources }
}

// Проверки: маршрут, переводы, роли, флаги, дубликаты, форма.
export function auditMenu(model) {
  const findings = []
  const { menu, routes, roles, flags, locales, sources } = model

  for (const name of menu.missing) {
    findings.push({ kind: 'source', msg: `не найден массив пунктов меню «${name}» — гейт проверял бы пустоту` })
  }

  const seen = new Set()
  for (const item of menu.items) {
    const key = `${item.file}#${item.array}#${item.to}`
    if (seen.has(key)) findings.push({ kind: 'duplicate', item, msg: `дубликат пункта меню «${item.to}» в ${item.array}` })
    seen.add(key)
  }

  for (const item of menu.items) {
    const where = `${item.file} (${item.array})`
    if (!item.to) {
      findings.push({ kind: 'shape', item, msg: `${where}: пункт меню без поля to` })
      continue
    }
    if (!item.labelKey) findings.push({ kind: 'shape', item, msg: `${where}: пункт «${item.to}» без labelKey` })

    if (item.to.includes(':')) {
      // Динамические маршруты в меню не встречаются; проверять нечего.
    } else if (!routes.has(item.to)) {
      findings.push({ kind: 'route', item, msg: `${where}: маршрут «${item.to}» не объявлен в ${ROUTES_FILE}` })
    }

    if (item.labelKey) {
      for (const [file, json] of Object.entries(locales)) {
        if (resolveKey(json, item.labelKey) === undefined) {
          findings.push({ kind: 'i18n', item, msg: `${where}: ключ «${item.labelKey}» отсутствует в ${file}` })
        }
      }
    }

    for (const role of item.roles) {
      if (roles && !roles.includes(role)) {
        findings.push({ kind: 'role', item, msg: `${where}: роль «${role}» не входит в EmployeeRole (${ROLES_FILE})` })
      }
    }
    if (item.file.endsWith('sidebar.tsx') && item.roles.length === 0) {
      findings.push({ kind: 'roles-empty', item, msg: `${where}: пункт «${item.to}» без roles — sidebar фильтрует по роли, пункт не появится` })
    }

    if (item.feature) {
      if (!flags.has(item.feature)) {
        findings.push({ kind: 'flag', item, msg: `${where}: флаг «${item.feature}» не объявлен в ${MIGRATIONS_DIR}` })
      }
      const src = sources[item.file]
      if (src && !src.includes(`useFeature('${item.feature}')`)) {
        findings.push({
          kind: 'flag-use',
          item,
          msg: `${where}: пункт гейтится флагом «${item.feature}», но файл не читает его через useFeature — пункт не появится`,
        })
      }
    }
  }

  return findings
}
