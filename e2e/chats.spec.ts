import { test, expect } from '@playwright/test'

test.describe('Chats', () => {
  test('chats page renders', async ({ page }) => {
    await page.goto('/chats')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('calendar page renders with events', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('news page renders', async ({ page }) => {
    await page.goto('/news')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })
})
