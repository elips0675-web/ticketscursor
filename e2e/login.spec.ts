import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test('redirects to tickets when already logged in', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/tickets|\/dashboard|\//)
  })
})
