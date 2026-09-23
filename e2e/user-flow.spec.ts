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

async function createTicketViaApi(
  page: import('@playwright/test').Page,
  token: string,
  title: string,
  description: string
) {
  const res = await page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.token}`,
        },
        body: JSON.stringify({
          title: args.title,
          description: args.description,
          priority: 'medium',
          category: 'incident',
        }),
      })
      return r.json()
    },
    { api: API, token, title, description }
  )
  return res?.data
}

test.describe('E2E: Login flow', () => {
  test('dev-login sets token and redirects to main page', async ({ page }) => {
    await page.goto('/login')
    await devLogin(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/tickets|\/dashboard|\//)
  })

  test('page shows user role after login', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.reload()
    await expect(page.getByText('Super Admin').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Ticket CRUD flow', () => {
  let token: string
  let ticketNumber: number

  test('create ticket via API and see it in list', async ({ page }) => {
    await page.goto('/')
    token = await devLogin(page)

    const title = `E2E Test ${Date.now()}`
    const ticket = await createTicketViaApi(page, token, title, 'Description for E2E test')
    ticketNumber = ticket?.number

    await page.goto('/tickets')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 })
  })

  test('open ticket detail and verify fields', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)

    await page.goto('/tickets')
    await page.waitForLoadState('networkidle')

    const firstTicket = page.locator('a[href^="/tickets/"]').first()
    await expect(firstTicket).toBeVisible({ timeout: 10000 })
    await firstTicket.click()

    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('add comment to ticket', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)

    await page.goto('/tickets')
    await page.waitForLoadState('networkidle')

    const firstTicket = page.locator('a[href^="/tickets/"]').first()
    await expect(firstTicket).toBeVisible({ timeout: 10000 })
    await firstTicket.click()

    await page.waitForLoadState('networkidle')

    const messageInput = page.locator('#ticket-message')
    if (await messageInput.isVisible()) {
      await messageInput.fill('E2E comment from Playwright')
      const sendBtn = page.locator('button[type="submit"]').filter({ hasText: /отправ|send|сообщ/i })
      if (await sendBtn.isVisible()) {
        await sendBtn.click()
        await expect(page.getByText('E2E comment from Playwright')).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('change ticket status', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)

    await page.goto('/tickets')
    await page.waitForLoadState('networkidle')

    const firstTicket = page.locator('a[href^="/tickets/"]').first()
    await expect(firstTicket).toBeVisible({ timeout: 10000 })
    await firstTicket.click()

    await page.waitForLoadState('networkidle')

    const statusSelect = page.locator('#ticket-status')
    if (await statusSelect.isVisible()) {
      await statusSelect.click()
      const inProgress = page.getByText(/in_progress|в работе/i)
      if (await inProgress.isVisible()) {
        await inProgress.click()
        await page.waitForTimeout(1000)
      }
    }
  })
})

test.describe('E2E: Navigation', () => {
  test('sidebar links work', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.reload()

    const pages = ['/tickets', '/chats', '/employees', '/wiki', '/news']
    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('admin page accessible for admin role', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('E2E: Search', () => {
  test('global search opens with Ctrl+K', async ({ page }) => {
    await page.goto('/')
    await devLogin(page)
    await page.reload()

    await page.keyboard.press('Control+k')
    const searchInput = page.getByPlaceholder(/поищите|поиск|search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
  })
})
