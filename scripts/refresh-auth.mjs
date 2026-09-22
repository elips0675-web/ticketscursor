// Обновление auth.json (storageState для check-console / Playwright):
// dev-login → сохранить token+user в localStorage контекста → storageState.
// Токен dev-login живёт 15 минут — при 401 в check-console просто запустить:
//   node scripts/refresh-auth.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const API = process.env.API_BASE || 'http://localhost:4000'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

  const data = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/auth/dev-login`, { method: 'POST' })
    return res.json()
  }, API)

  const token = data?.data?.token || data?.token
  const user = data?.data?.user || { id: 1, name: 'Dev Admin', email: 'dev@test.com', role: 'admin' }
  if (!token) {
    throw new Error(`dev-login не вернул token (${JSON.stringify(data)})`)
  }

  await page.evaluate(
    ({ t, u }) => {
      localStorage.setItem('token', t)
      localStorage.setItem('user', JSON.stringify(u))
    },
    { t: token, u: user }
  )
  await context.storageState({ path: 'auth.json' })
  await browser.close()
  console.log(`✅ auth.json обновлён (token ${token.slice(0, 18)}…, user=${user.role}/${user.email})`)
}

main().catch((e) => {
  console.error(`❌ refresh-auth: ${e.message}`)
  process.exit(1)
})