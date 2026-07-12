import { chromium, type FullConfig } from '@playwright/test'

async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
  const token = await page.evaluate(async () => {
    const r = await fetch('http://localhost:4000/api/auth/dev-login', { method: 'POST' })
    const d = await r.json()
    return d?.data?.token || d?.token
  })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.context().storageState({ path: 'auth.json' })
  await browser.close()
}

export default globalSetup
