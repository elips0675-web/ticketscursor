import { test, expect } from '@playwright/test'

test.describe('Notifications', () => {
  test('notifications page renders', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })
})
