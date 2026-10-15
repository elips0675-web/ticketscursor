import { chromium } from 'playwright'
import { collectMenu } from './scripts/menu-inventory.mjs'

// Базовый список (страницы, которых нет в меню: уведомления, вложенные админ-разделы).
const BASE_PAGES = [
  '/', '/wiki', '/chats', '/tickets', '/employees', '/search',
  '/calendar', '/polls', '/files', '/notifications', '/kanban', '/profile',
  '/news', '/calculator', '/admin', '/admin/users', '/admin/push',
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
