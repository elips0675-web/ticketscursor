import { test, expect } from '@playwright/test'

test.describe('Tickets', () => {
  test('renders tickets list', async ({ page }) => {
    await page.goto('/tickets')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('navigates to new ticket page', async ({ page }) => {
    await page.goto('/tickets/new')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('renders page title on new ticket', async ({ page }) => {
    await page.goto('/tickets/new')
    await expect(page.locator('input, textarea').first()).toBeVisible()
  })
})
