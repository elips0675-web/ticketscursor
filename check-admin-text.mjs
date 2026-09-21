import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ storageState: 'auth.json' })

const pages = ['/admin', '/admin/users', '/admin/settings', '/admin/push', '/admin/rules']

for (const path of pages) {
  const page = await ctx.newPage()
  try {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    
    const body = await page.locator('body').innerText()
    console.log(`\n===== ${path} =====`)
    console.log(body)
  } catch (err) {
    console.log(`⚠️  [${path}] ОШИБКА: ${err.message}`)
  }
  await page.close()
}

await browser.close()
