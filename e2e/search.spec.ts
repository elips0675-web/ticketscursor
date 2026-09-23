import { test, expect } from '@playwright/test'

test.describe('Global search', () => {
  test('search dialog opens with Ctrl+K', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder(/поищите|поиск|search/i).first()).toBeVisible()
  })

  test('search input accepts text', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder(/поищите|поиск|search/i).first()
    await input.fill('test')
    await expect(input).toHaveValue('test')
  })
})
