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

async function createTicketViaApi(
  page: import('@playwright/test').Page,
  token: string,
  title: string,
  description: string
) {
  const res = await page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.token}`,
        },
        body: JSON.stringify({
          title: args.title,
          description: args.description,
          priority: 'medium',
          category: 'incident',
        }),
      })
      return r.json()
    },
    { api: API, token, title, description }
  )
  return res?.data
}

async function apiGetTicket(page: import('@playwright/test').Page, token: string, id: number) {
  return page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}/api/tickets/${args.id}`, {
        headers: { Authorization: `Bearer ${args.token}` },
      })
      return { status: r.status, body: await r.json() }
    },
    { api: API, token, id }
  )
}

async function apiGetMessages(page: import('@playwright/test').Page, token: string, id: number) {
  return page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}/api/tickets/${args.id}/messages`, {
        headers: { Authorization: `Bearer ${args.token}` },
      })
      return { status: r.status, body: await r.json() }
    },
    { api: API, token, id }
  )
}

async function apiDeleteTicket(page: import('@playwright/test').Page, token: string, id: number) {
  return page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}/api/tickets/${args.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${args.token}` },
      })
      return { status: r.status, body: await r.json() }
    },
    { api: API, token, id }
  )
}

test.describe('E2E: Жизненный цикл тикета через данные', () => {
  test('тикет с заголовком появляется в списке после create через API и открывается в деталях', async ({ page }) => {
    await page.goto('/')
    const token = await devLogin(page)
    const title = `E2E lifecycle список ${Date.now()}`
    const ticket = await createTicketViaApi(page, token, title, 'Описание для lifecycle-теста')
    expect(ticket?.id).toBeTruthy()

    await page.goto('/tickets')
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 })

    await page.getByText(title).first().click()
    await page.waitForURL(/\/tickets\/\d+/)
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Открытые').first()).toBeVisible()

    const detail = await apiGetTicket(page, token, ticket.id)
    expect(detail.status).toBe(200)
    expect(detail.body.data.title).toBe(title)
    expect(detail.body.data.status).toBe('open')

    const del = await apiDeleteTicket(page, token, ticket.id)
    expect(del.status).toBe(200)
    const after = await apiGetTicket(page, token, ticket.id)
    expect(after.status).toBe(404)
  })

  test('комментарий, отправленный из деталей, виден в UI и возвращается messages API', async ({ page }) => {
    await page.goto('/')
    const token = await devLogin(page)
    const title = `E2E lifecycle комментарий ${Date.now()}`
    const ticket = await createTicketViaApi(page, token, title, 'Описание для комментария')
    expect(ticket?.id).toBeTruthy()

    await page.goto(`/tickets/${ticket.id}`)
    const comment = `E2E комментарий ${Date.now()}`
    await page.locator('#ticket-message').fill(comment)
    await page.getByRole('button', { name: 'Отправить' }).click()
    await expect(page.getByText(comment).first()).toBeVisible({ timeout: 10000 })

    const msgs = await apiGetMessages(page, token, ticket.id)
    expect(msgs.status).toBe(200)
    expect(msgs.body.data.some((m: { text: string }) => m.text === comment)).toBe(true)

    const detail = await apiGetTicket(page, token, ticket.id)
    expect(detail.body.data.messages.some((m: { text: string }) => m.text === comment)).toBe(true)

    await apiDeleteTicket(page, token, ticket.id)
  })

  test('смена статуса на «В работе» и «Решённые» в UI сохраняется через API', async ({ page }) => {
    await page.goto('/')
    const token = await devLogin(page)
    const title = `E2E lifecycle статус ${Date.now()}`
    const ticket = await createTicketViaApi(page, token, title, 'Описание для статусов')
    expect(ticket?.id).toBeTruthy()

    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText('Открытые').first()).toBeVisible({ timeout: 10000 })

    await page.locator('#ticket-status').click()
    await page.getByText('В работе', { exact: true }).click()
    await expect(page.locator('#ticket-status')).toContainText('В работе', { timeout: 10000 })
    let detail = await apiGetTicket(page, token, ticket.id)
    expect(detail.body.data.status).toBe('in_progress')

    await page.locator('#ticket-status').click()
    await page.getByText('Решённые', { exact: true }).click()
    await expect(page.locator('#ticket-status')).toContainText('Решённые', { timeout: 10000 })
    detail = await apiGetTicket(page, token, ticket.id)
    expect(detail.body.data.status).toBe('resolved')

    await apiDeleteTicket(page, token, ticket.id)
  })

  test('resolved-тикет переоткрывается (reopen) и статус reopened виден в UI и API', async ({ page }) => {
    await page.goto('/')
    const token = await devLogin(page)
    const title = `E2E lifecycle reopen ${Date.now()}`
    const ticket = await createTicketViaApi(page, token, title, 'Описание для reopen')

    const st = await page.evaluate(
      async (args) => {
        const r = await fetch(`${args.api}/api/tickets/${args.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${args.token}`,
          },
          body: JSON.stringify({ status: 'in_progress' }),
        })
        return { status: r.status, body: await r.json() }
      },
      { api: API, id: ticket.id, token }
    )
    expect(st.status).toBe(200)

    const resolved = await page.evaluate(
      async (args) => {
        const r = await fetch(`${args.api}/api/tickets/${args.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${args.token}`,
          },
          body: JSON.stringify({ status: 'resolved' }),
        })
        return { status: r.status, body: await r.json() }
      },
      { api: API, id: ticket.id, token }
    )
    expect(resolved.status).toBe(200)

    const bulk = await page.evaluate(
      async (args) => {
        const r = await fetch(`${args.api}/api/tickets/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${args.token}`,
          },
          body: JSON.stringify({ action: 'status', status: 'reopened', ids: [args.id] }),
        })
        return { status: r.status, body: await r.json() }
      },
      { api: API, id: ticket.id, token }
    )
    expect(bulk.status).toBe(200)

    const detail = await apiGetTicket(page, token, ticket.id)
    expect(detail.body.data.status).toBe('reopened')

    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText('reopened').first()).toBeVisible({ timeout: 10000 })

    await page.goto('/tickets')
    await expect(page.getByText('reopened').first()).toBeVisible({ timeout: 10000 })

    await apiDeleteTicket(page, token, ticket.id)
  })
})