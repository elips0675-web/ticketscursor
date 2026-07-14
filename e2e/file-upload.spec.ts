import { test, expect } from '@playwright/test'

test.describe('File upload', () => {
  test('files page renders with controls', async ({ page }) => {
    await page.goto('/files')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('files page has upload area', async ({ page }) => {
    await page.goto('/files')
    await expect(page.locator('[class*="drop"], [class*="upload"], button, [role="button"]').first()).toBeVisible()
  })
})
