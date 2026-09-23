import { test, expect } from '@playwright/test'

const API = 'http://localhost:4000'

async function devLogin(page: import('@playwright/test').Page, email = 'alexey@example.com') {
  const token = await page.evaluate(async (args) => {
    const r = await fetch(`${args.api}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'X-Email': args.email },
    })
    const d = await r.json()
    return d?.data?.token || d?.token
  }, { api: API, email })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.evaluate((e) => localStorage.setItem('user', JSON.stringify(e)), { id: 1, name: 'Алексей Петров', email: 'alexey@example.com', role: 'super_admin' })
  return token
}

test.describe('E2E: Чат в реальном времени через WebSocket (2 браузера)', () => {
  test('сообщение из первого окна появляется во втором без перезагрузки', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await pageA.goto('/')
    const tokenA = await devLogin(pageA)
    await pageB.goto('/')
    await devLogin(pageB)

    // второй сотрудник для личного чата (dev-login всегда возвращает id=1)
    const emp = await pageA.evaluate(async (args) => {
      const r = await fetch(`${args.api}/api/employees`, {
        headers: { Authorization: `Bearer ${args.token}` },
      })
      const d = await r.json()
      const list = d?.data || []
      return list.find((x: { id: number }) => x.id !== 1) || list[0] || null
    }, { api: API, token: tokenA })
    expect(emp?.id).toBeTruthy()

    const chat = await pageA.evaluate(async (args) => {
      const r = await fetch(`${args.api}/api/chats/personal/${args.userId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${args.token}` },
      })
      const d = await r.json()
      return d?.data || null
    }, { api: API, token: tokenA, userId: emp.id })
    expect(chat?.id).toBeTruthy()
    const chatId = chat.id as number

    await pageA.goto(`/chats/${chatId}`)
    await pageB.goto(`/chats/${chatId}`)
    const inputA = pageA.locator('input[placeholder="Написать сообщение..."]')
    const inputB = pageB.locator('input[placeholder="Написать сообщение..."]')
    await expect(inputA).toBeVisible({ timeout: 10000 })
    await expect(inputB).toBeVisible({ timeout: 10000 })

    // даём обоим окнам подключиться к socket.io и подписаться на комнату чата
    await pageA.waitForTimeout(2500)

    const msg = `E2E realtime ${Date.now()}`
    await inputA.fill(msg)
    await pageA.locator('button[aria-label="Отправить"]').click()

    // отправитель видит своё сообщение
    await expect(pageA.getByText(msg).first()).toBeVisible({ timeout: 10000 })
    // второе окно получает его через WebSocket без перезагрузки
    await expect(pageB.getByText(msg).first()).toBeVisible({ timeout: 10000 })

    await ctxA.close()
    await ctxB.close()
  })
})