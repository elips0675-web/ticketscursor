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
    
    // Check for i18n keys
    const keyPattern = /\b(admin\.\w+|common\.\w+|employees\.\w+|tickets\.\w+|search\.\w+|dashboard\.\w+|polls\.\w+|news\.\w+)\b/g
    const matches = [...new Set((body.match(keyPattern) || []))]
    
    if (matches.length > 0) {
      console.log(`\n❌ [${path}] НЕПЕРЕВЕДЁННЫЕ КЛЮЧИ (${matches.length}):`)
      matches.forEach(k => console.log(`   ${k}`))
    } else {
      console.log(`✅ [${path}] — все слова на русском`)
    }
  } catch (err) {
    console.log(`⚠️  [${path}] ОШИБКА: ${err.message}`)
  }
  await page.close()
}

await browser.close()
console.log('\nГотово.')
