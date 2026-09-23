import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test('already logged in user sees dashboard on /', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('h1').first()).toBeVisible()
  })
})
