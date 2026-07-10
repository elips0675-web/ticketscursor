import { test, expect } from '@playwright/test'

test.describe('Chats', () => {
  test('renders chats list', async ({ page }) => {
    await page.goto('/chats')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })
})
