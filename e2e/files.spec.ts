import { test, expect } from '@playwright/test'

test.describe('Files page', () => {
  test('shows file folders and files', async ({ page }) => {
    await page.goto('/files')
    await expect(page.getByRole('heading', { name: 'Файлы' })).toBeVisible()
  })

  test('has upload dropzone', async ({ page }) => {
    await page.goto('/files')
    await expect(page.getByText('Перетащите файлы сюда')).toBeVisible()
  })

  test('can switch between grid and list view', async ({ page }) => {
    await page.goto('/files')
    await page.getByLabel('Вид списком').click()
    await expect(page.getByLabel('Вид сеткой')).toBeVisible()
  })
})
