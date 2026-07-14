import { test, expect } from '@playwright/test'

test.describe('Profile', () => {
  test('profile page renders', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })
})
