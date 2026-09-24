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

  test('search returns real results from API and navigates to the ticket', async ({ page }) => {
    await page.goto('/search')
    await page.getByPlaceholder(/Введите запрос/).fill('экспорт')
    // Реальный результат из БД (seed-тикет «Добавить экспорт в Excel»)
    await expect(page.getByText('Добавить экспорт в Excel')).toBeVisible({ timeout: 15000 })
    await page.getByText('Добавить экспорт в Excel').click()
    await expect(page).toHaveURL(/\/tickets\/\d+/)
  })

  test('search shows empty state for unknown query', async ({ page }) => {
    await page.goto('/search')
    await page.getByPlaceholder(/Введите запрос/).fill('zzqzzq')
    await expect(page.getByText('Ничего не найдено')).toBeVisible({ timeout: 15000 })
  })
})