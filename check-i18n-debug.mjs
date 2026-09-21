import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ storageState: 'auth.json' })
const pages = ['/admin', '/admin/users', '/admin/settings', '/admin/push']

for (const path of pages) {
  const page = await ctx.newPage()
  try {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    
    const body = await page.locator('body').innerText()
    
    // Find all text that looks like untranslated i18n keys
    const lines = body.split('\n').filter(l => /^\w+\.\w+$/.test(l.trim()))
    
    if (lines.length > 0) {
      console.log(`\n❌ [${path}] КЛЮЧИ ВМЕСТО ТЕКСТА:`)
      lines.forEach(l => console.log(`   ${l}`))
    } else {
      console.log(`✅ [${path}] — все ключи переведены`)
    }
    
    // Also show first 500 chars of body for manual check
    console.log(`   Текст: ${body.slice(0, 300).replace(/\n/g, ' | ')}`)
  } catch (err) {
    console.log(`⚠️  [${path}] ОШИБКА: ${err.message}`)
  }
  await page.close()
}

await browser.close()
