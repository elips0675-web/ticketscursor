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
  priority = 'medium'
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
          description: 'Описание для SLA E2E',
          priority: args.priority,
          category: 'incident',
        }),
      })
      return r.json()
    },
    { api: API, token, title, priority }
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

async function apiGetSettings(page: import('@playwright/test').Page, token: string) {
  return page.evaluate(async (args) => {
    const r = await fetch(`${args.api}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${args.token}` },
    })
    return (await r.json())?.data || {}
  }, { api: API, token })
}

async function apiPutSettings(page: import('@playwright/test').Page, token: string, body: Record<string, string>) {
  return page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}/api/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.token}`,
        },
        body: JSON.stringify(args.body),
      })
      return { status: r.status, body: await r.json() }
    },
    { api: API, token, body }
  )
}

async function apiRunSlaCheck(page: import('@playwright/test').Page, token: string) {
  return page.evaluate(async (args) => {
    const r = await fetch(`${args.api}/api/admin/sla/run-check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.token}` },
    })
    return { status: r.status, body: await r.json() }
  }, { api: API, token })
}

const SLA_KEYS = ['SLA_RESPONSE_HOURS', 'SLA_ESCALATION_HOURS', 'SLA_ESCALATION_ENABLED']

test.describe('E2E: SLA — просрочка, эскалация, бадж', () => {
  test('due_at тикета следует из настройки SLA_RESPONSE_HOURS', async ({ page }) => {
    await page.goto('/')
    const token = await devLogin(page)
    const original = await apiGetSettings(page, token)

    await apiPutSettings(page, token, { SLA_RESPONSE_HOURS: '0.0001' })
    const ticket1 = await createTicketViaApi(page, token, `E2E SLA короткий ${Date.now()}`)
    expect(ticket1?.id).toBeTruthy()
    const d1 = await apiGetTicket(page, token, ticket1.id)
    expect(d1.status).toBe(200)

    await apiPutSettings(page, token, { SLA_RESPONSE_HOURS: '4' })
    const ticket2 = await createTicketViaApi(page, token, `E2E SLA обычный ${Date.now()}`)
    expect(ticket2?.id).toBeTruthy()
    const d2 = await apiGetTicket(page, token, ticket2.id)
    expect(d2.status).toBe(200)

    const due1 = new Date(d1.body.data.due_at).getTime()
    const due2 = new Date(d2.body.data.due_at).getTime()
    expect(Number.isFinite(due1)).toBe(true)
    expect(Number.isFinite(due2)).toBe(true)
    // короткий SLA → due_at почти сразу; обычный 4 часа → заметно позже
    expect(due2 - due1).toBeGreaterThan(60 * 60 * 1000)

    await apiPutSettings(page, token, restoreSlaSettings(original))
    await apiDeleteTicket(page, token, ticket1.id)
    await apiDeleteTicket(page, token, ticket2.id)
  })

  test('просроченный тикет получает эскалацию, повышенный приоритет и бадж в UI', async ({ page }) => {
    await page.goto('/')
    const token = await devLogin(page)
    const original = await apiGetSettings(page, token)

    await apiPutSettings(page, token, {
      SLA_RESPONSE_HOURS: '0.0001',
      SLA_ESCALATION_HOURS: '0.0001',
      SLA_ESCALATION_ENABLED: 'true',
    })
    const title = `E2E SLA эскалация ${Date.now()}`
    const ticket = await createTicketViaApi(page, token, title, 'medium')
    expect(ticket?.id).toBeTruthy()

    // дожидаемся, пока due_at уйдёт в прошлое (0.0001 ч ≈ 0.36 с)
    await page.waitForTimeout(2500)

    const run = await apiRunSlaCheck(page, token)
    expect(run.status).toBe(200)

    const detail = await apiGetTicket(page, token, ticket.id)
    expect(detail.body.data.escalation_level).toBeGreaterThan(0)
    expect(detail.body.data.priority).toBe('high')

    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText('Эскалация ур. 1').first()).toBeVisible({ timeout: 10000 })

    await apiPutSettings(page, token, restoreSlaSettings(original))
    await apiDeleteTicket(page, token, ticket.id)
  })
})

function restoreSlaSettings(original: Record<string, string>) {
  const restore: Record<string, string> = {}
  for (const key of SLA_KEYS) {
    restore[key] = original[key] ?? ''
  }
  return restore
}