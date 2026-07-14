import { test, expect } from '@playwright/test'

test.describe('Kanban', () => {
  test('kanban page renders', async ({ page }) => {
    await page.goto('/kanban')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })
})
