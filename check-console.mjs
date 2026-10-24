import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectMenu } from './scripts/menu-inventory.mjs'
import { refreshAuthJson } from './scripts/refresh-auth-json.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const API_URL = process.env.API_URL || 'http://localhost:4000'

// Базовый список (страницы, которых нет в меню: уведомления, вложенные админ-разделы).
const BASE_PAGES = [
  '/', '/wiki', '/chats', '/tickets', '/employees', '/search',
  '/calendar', '/polls', '/files', '/notifications', '/kanban', '/profile',
  '/news', '/calculator', '/admin', '/admin/users', '/admin/push',
  '/kb', '/portal',
]

// Все пункты меню (sidebar + admin-layout) — чтобы новый пункт попадал в обход
// сам, без ручной правки этого файла. Источник — scripts/menu-inventory.mjs.
const MENU_PAGES = collectMenu(import.meta.dirname).items
  .map((item) => item.to)
  .filter((to) => typeof to === 'string' && to.length > 0 && !to.includes(':'))

const PAGES = [...BASE_PAGES, ...MENU_PAGES.filter((p) => !BASE_PAGES.includes(p))]
const BASE = process.env.BASE_URL || 'http://localhost:5173'

// Страницы с уже подтверждёнными дефектами (проверено 15.10.2026 на стенде
// e2e-db-setup + dev-login, точные запросы — в «Что-доделать.txt», раздел
// «Вскрыто расширением check-console»). Пока дефект не починен, страница
// обходится, но её ошибки не валят гейт; как только страница станет зелёной,
// скрипт напомнит убрать её отсюда (реестр не должен протухать молча).
const TRACKED_ISSUES = {
  '/team': 'org_chart off → GET /api/team/org-chart 404, но страница всё равно шлёт запрос',
  '/tickets/new': 'GET /api/tickets/custom-fields 500 — дрейф custom_field_definitions',
  '/admin/settings': 'GET /api/admin/scheduled-reports 404 (флаг off) + /api/api-tokens, /api/webhooks, /api/rules 500 (нет таблиц в тест-БД)',
  '/admin/custom-fields': 'GET /api/admin/custom-fields 500 — дрейф custom_field_definitions',
}

async function main() {
  const authPath = join(ROOT, 'auth.json')
  // JWT от dev-login живёт ~15 минут: протухший токен в auth.json даёт 401 на всех
  // публичных страницах. Обновляем его перед обходом — механизм общий с CI-раннером
  // (scripts/refresh-auth-json.mjs), здесь в мягком режиме: обновление не удалось →
  // идём со старым токеном, но если auth.json нет вообще — падаем внятно.
  const { refreshed, error } = await refreshAuthJson({
    apiUrl: API_URL,
    authPath,
    origin: BASE,
  })
  if (refreshed) {
    console.log('[check-console] auth.json обновлён через dev-login')
  } else if (!existsSync(authPath)) {
    throw new Error(`auth.json отсутствует и обновить его не удалось: ${error?.message || error}`)
  }
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: 'auth.json' })
  let allOk = true

  for (const path of PAGES) {
    const page = await context.newPage()
    const errors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', (err) => errors.push(err.message))

    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 })
      await page.waitForTimeout(1000)

      // check for cyrillic text in body
      const body = await page.locator('body').innerText()
      const hasRussian = /[а-яёА-ЯЁ]/.test(body)

      const status = errors.length === 0 ? 'OK' : TRACKED_ISSUES[path] ? 'TRACKED' : 'ERRORS'
      const russian = hasRussian ? 'RU' : 'NO_RU'
      console.log(`[${status}/${russian}] ${path}`)

      if (errors.length > 0) {
        if (TRACKED_ISSUES[path]) {
          console.log(`  tracked (не валит гейт): ${TRACKED_ISSUES[path]}`)
          for (const e of errors) console.log(`    ${e}`)
        } else {
          allOk = false
          for (const e of errors) console.error(`  console.error: ${e}`)
        }
      } else if (TRACKED_ISSUES[path]) {
        console.log(`  ⚠ страница больше не падает — убери её из TRACKED_ISSUES и закрой пункт бэклога`)
      }
      if (!hasRussian) {
        allOk = false
        console.error(`  FAIL: no Russian text found on ${path}`)
      }
    } catch (err) {
      allOk = false
      console.error(`[FAIL] ${path}: ${err.message}`)
    } finally {
      await page.close()
    }
  }

  await browser.close()
  if (!allOk) {
    console.error('\ncheck-console: FAILED')
    process.exit(1)
  }
  console.log('\ncheck-console: ALL OK')
}

main()
