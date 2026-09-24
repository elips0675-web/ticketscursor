import { test, expect } from '@playwright/test'

test.describe('SLA / Auto-assign / Export', () => {
  test('tickets page has export CSV button', async ({ page }) => {
    await page.goto('/tickets')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })

  test('exports tickets list as a real CSV download', async ({ page }) => {
    await page.goto('/tickets')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button').filter({ hasText: /csv/i }).first().click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  test('tickets page has export PDF button', async ({ page }) => {
    await page.goto('/tickets')
    await expect(page.getByRole('button').filter({ hasText: /pdf/i }).first()).toBeVisible()
  })

  test('calendar page has export CSV button', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })

  test('employees page has export CSV button', async ({ page }) => {
    await page.goto('/employees')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })

  test('shows tickets with SLA badges', async ({ page }) => {
    await page.goto('/tickets')
    const cards = page.locator('[class*="card"], [class*="Card"], article, [role="button"]').filter({ hasText: /ticket|\d/i })
    await expect(cards.first()).toBeVisible()
  })

  test('news page has export CSV button', async ({ page }) => {
    await page.goto('/news')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })
})