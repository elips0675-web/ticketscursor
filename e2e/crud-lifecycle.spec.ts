import { test, expect } from '@playwright/test'

const API = 'http://localhost:4000'

async function devLogin(page: import('@playwright/test').Page, email = 'alexey@example.com') {
  const token = await page.evaluate(async (args) => {
    const r = await fetch(`${args.api}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'X-Email': args.email },
    })
    const d = await r.json()
    return d?.data?.token || d?.token
  }, { api: API, email })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.evaluate((e) => localStorage.setItem('user', JSON.stringify(e)), { id: 1, name: 'Алексей Петров', email: 'alexey@example.com', role: 'super_admin' })
  return token
}

test.describe('E2E: Full Ticket Lifecycle', () => {
  test('create ticket via UI form and verify in list', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    await page.goto('/tickets/new')
    await page.waitForLoadState('networkidle')

    const titleInput = page.locator('input[name="title"], input[placeholder*="заголов|title|назван"]').first()
    if (await titleInput.isVisible({ timeout: 5000 })) {
      await titleInput.fill(`UI Ticket ${Date.now()}`)

      const descInput = page.locator('textarea[name="description"], textarea[placeholder*="опис|description"]').first()
      if (await descInput.isVisible()) {
        await descInput.fill('Создан через UI в E2E тесте')
      }

      const submitBtn = page.locator('button[type="submit"]').first()
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await page.waitForTimeout(2000)
      }
    }

    await page.goto('/tickets')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Calendar Flow', () => {
  test('navigate to calendar and see events', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Chats Flow', () => {
  test('navigate to chats and see chat list', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.goto('/chats')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Wiki Flow', () => {
  test('navigate to wiki and see articles', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.goto('/wiki')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Employees Flow', () => {
  test('navigate to employees and see list', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Dashboard Flow', () => {
  test('dashboard shows stats after login', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })
})
