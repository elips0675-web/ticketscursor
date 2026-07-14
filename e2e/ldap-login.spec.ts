import { test, expect } from '@playwright/test'

test.describe('LDAP login', () => {
  test('login page has LDAP hint', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText(/ldap|ad|domain|authenticat/i).first()).toBeVisible()
  })

  test('login form has required fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })
})
