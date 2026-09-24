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

  test('uploads a real file through the dropzone input', async ({ page }) => {
    await page.goto('/files')
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    await page.setInputFiles('input[type="file"]', {
      name: 'e2e-upload.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    })
    // Реальная загрузка на сервер (multer + file-type magic) → toast об успехе на русском
    await expect(page.getByText(/Файл загружен: e2e-upload\.png/)).toBeVisible({ timeout: 15000 })
  })
})