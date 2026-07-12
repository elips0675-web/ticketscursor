import { chromium } from 'playwright'

const PAGES = ['/', '/wiki', '/chats', '/tickets', '/employees', '/search']
const BASE = process.env.BASE_URL || 'http://localhost:5173'

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

      const status = errors.length === 0 ? 'OK' : 'ERRORS'
      const russian = hasRussian ? 'RU' : 'NO_RU'
      console.log(`[${status}/${russian}] ${path}`)

      if (errors.length > 0) {
        allOk = false
        for (const e of errors) console.error(`  console.error: ${e}`)
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
