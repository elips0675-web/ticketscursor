import { test, expect } from '@playwright/test'

test.describe('Calculator', () => {
  test('calculator page renders', async ({ page }) => {
    await page.goto('/calculator')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('calculator has input fields', async ({ page }) => {
    await page.goto('/calculator')
    await expect(page.locator('input, select, button').first()).toBeVisible()
  })
})
