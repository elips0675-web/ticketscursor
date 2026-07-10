import { test, expect } from '@playwright/test'

test.describe('SLA / Auto-assign / Export', () => {
  test('tickets page has export CSV button', async ({ page }) => {
    await page.goto('/tickets')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })

  test('tickets page has export PDF button', async ({ page }) => {
    await page.goto('/tickets')
    await expect(page.getByRole('button').filter({ hasText: /pdf/i }).first()).toBeVisible()
  })

  test('calendar page has export CSV button', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })

  test('employees page has export CSV button', async ({ page }) => {
    await page.goto('/employees')
    await expect(page.getByRole('button').filter({ hasText: /csv/i }).first()).toBeVisible()
  })
})
