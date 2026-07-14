import { test, expect } from '@playwright/test'

test.describe('Admin audit', () => {
  test('audit page renders', async ({ page }) => {
    await page.goto('/admin/audit')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('audit page has table or list', async ({ page }) => {
    await page.goto('/admin/audit')
    await expect(page.locator('table, [role="grid"], [role="list"]').first()).toBeVisible()
  })
})
