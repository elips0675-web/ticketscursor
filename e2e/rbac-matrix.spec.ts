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

async function api(
  page: import('@playwright/test').Page,
  method: string,
  path: string,
  token: string,
  body?: unknown
) {
  return page.evaluate(
    async (args) => {
      const r = await fetch(`${args.api}${args.path}`, {
        method: args.method,
        headers: {
          'Content-Type': 'application/json',
          ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}),
        },
        body: args.body ? JSON.stringify(args.body) : undefined,
      })
      return { status: r.status, body: await r.json() }
    },
    { api: API, method, path, token, body }
  )
}

async function apiRegister(
  page: import('@playwright/test').Page,
  token: string,
  name: string,
  email: string,
  password: string
) {
  const res = await api(page, 'POST', '/api/auth/register', token, { name, email, password })
  return res.body?.data?.employee?.id as number | undefined
}

async function apiSetRole(page: import('@playwright/test').Page, token: string, id: number, role: string) {
  return api(page, 'PUT', `/api/admin/users/${id}`, token, { role })
}

async function apiLogin(page: import('@playwright/test').Page, email: string, password: string) {
  const res = await api(page, 'POST', '/api/auth/login', '', { email, password })
  return { status: res.status, token: res.body?.data?.token as string | undefined }
}

async function apiCreateTicket(page: import('@playwright/test').Page, token: string, title: string) {
  const res = await api(page, 'POST', '/api/tickets', token, {
    title,
    description: 'Описание для RBAC E2E',
    priority: 'medium',
    category: 'incident',
  })
  return res.body?.data as { id: number } | undefined
}

async function apiListTitles(page: import('@playwright/test').Page, token: string) {
  const res = await api(page, 'GET', '/api/tickets', token)
  const rows = res.body?.data || []
  return rows.map((r: { title: string }) => r.title)
}

test.describe('E2E: RBAC-матрица — каждая роль видит только своё', () => {
  test('requester видит только свои тикеты, agent — свои и неназначенные, senior_agent — все', async ({ page }) => {
    await page.goto('/')
    const adminToken = await devLogin(page)
    const stamp = Date.now()
    const password = 'E2ePass123!'

    const reqId = await apiRegister(page, adminToken, 'Требователь E2E', `e2e.req.${stamp}@test.dev`, password)
    const agentId = await apiRegister(page, adminToken, 'Агент E2E', `e2e.agent.${stamp}@test.dev`, password)
    const seniorId = await apiRegister(page, adminToken, 'Ст. агент E2E', `e2e.senior.${stamp}@test.dev`, password)
    expect(reqId).toBeTruthy()
    expect(agentId).toBeTruthy()
    expect(seniorId).toBeTruthy()

    await apiSetRole(page, adminToken, reqId!, 'requester')
    await apiSetRole(page, adminToken, agentId!, 'agent')
    await apiSetRole(page, adminToken, seniorId!, 'senior_agent')

    const reqLogin = await apiLogin(page, `e2e.req.${stamp}@test.dev`, password)
    const agentLogin = await apiLogin(page, `e2e.agent.${stamp}@test.dev`, password)
    const seniorLogin = await apiLogin(page, `e2e.senior.${stamp}@test.dev`, password)
    expect(reqLogin.status).toBe(200)
    expect(agentLogin.status).toBe(200)
    expect(seniorLogin.status).toBe(200)

    const reqTitle = `RBAC тикет требователя ${stamp}`
    const adminTitle = `RBAC тикет админа ${stamp}`
    const agentTitle = `RBAC тикет агента ${stamp}`
    const ticketReq = await apiCreateTicket(page, reqLogin.token!, reqTitle)
    const ticketAdmin = await apiCreateTicket(page, adminToken, adminTitle)
    const ticketAgent = await apiCreateTicket(page, adminToken, agentTitle)
    expect(ticketReq?.id).toBeTruthy()
    expect(ticketAdmin?.id).toBeTruthy()
    expect(ticketAgent?.id).toBeTruthy()

    await api(page, 'PUT', `/api/tickets/${ticketAgent!.id}/assign`, adminToken, { employeeId: agentId })

    // Явные назначения остальных тикетов — убираем недетерминизм авто-назначения getLeastLoadedAssignee
    await api(page, 'PUT', `/api/tickets/${ticketReq!.id}/assign`, adminToken, { employeeId: seniorId })
    await api(page, 'PUT', `/api/tickets/${ticketAdmin!.id}/assign`, adminToken, { employeeId: null })

    // requester — только свой тикет
    const reqTitles = await apiListTitles(page, reqLogin.token!)
    expect(reqTitles).toContain(reqTitle)
    expect(reqTitles).not.toContain(adminTitle)
    expect(reqTitles).not.toContain(agentTitle)
    const reqOnAdmin = await api(page, 'GET', `/api/tickets/${ticketAdmin!.id}`, reqLogin.token!)
    expect(reqOnAdmin.status).toBe(403)

    // agent — неназначенные + назначенные на него
    const agentTitles = await apiListTitles(page, agentLogin.token!)
    expect(agentTitles).toContain(adminTitle)
    expect(agentTitles).toContain(agentTitle)
    expect(agentTitles).not.toContain(reqTitle)
    const agentOnReq = await api(page, 'GET', `/api/tickets/${ticketReq!.id}`, agentLogin.token!)
    expect(agentOnReq.status).toBe(403)

    // senior_agent — все тикеты
    const seniorTitles = await apiListTitles(page, seniorLogin.token!)
    expect(seniorTitles).toContain(reqTitle)
    expect(seniorTitles).toContain(adminTitle)
    expect(seniorTitles).toContain(agentTitle)
    const seniorOnReq = await api(page, 'GET', `/api/tickets/${ticketReq!.id}`, seniorLogin.token!)
    expect(seniorOnReq.status).toBe(200)

    // cleanup
    for (const id of [ticketReq!.id, ticketAdmin!.id, ticketAgent!.id]) {
      await api(page, 'DELETE', `/api/tickets/${id}`, adminToken)
    }
    for (const id of [reqId!, agentId!, seniorId!]) {
      await api(page, 'PUT', `/api/admin/users/${id}`, adminToken, { isActive: false })
    }
  })

  test('requester в UI не видит блок управления статусом в деталях тикета', async ({ page }) => {
    await page.goto('/')
    const adminToken = await devLogin(page)
    const stamp = Date.now()
    const password = 'E2ePass123!'
    const email = `e2e.ui.req.${stamp}@test.dev`

    const reqId = await apiRegister(page, adminToken, 'Требователь UI E2E', email, password)
    expect(reqId).toBeTruthy()
    await apiSetRole(page, adminToken, reqId!, 'requester')

    const reqLogin = await apiLogin(page, email, password)
    expect(reqLogin.status).toBe(200)

    const title = `RBAC UI тикет ${stamp}`
    const ticket = await apiCreateTicket(page, reqLogin.token!, title)
    expect(ticket?.id).toBeTruthy()

    // Перезаписываем localStorage — UI откроет тикет от имени requester, а не admin
    await page.evaluate(
      (args) => {
        localStorage.setItem('token', args.token)
        localStorage.setItem('user', JSON.stringify(args.user))
      },
      {
        token: reqLogin.token!,
        user: { id: reqId, name: 'Требователь UI E2E', email, role: 'requester' },
      },
    )

    await page.goto(`/tickets/${ticket!.id}`)
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#ticket-status')).toHaveCount(0)
    await expect(page.getByText('Управление').first()).toHaveCount(0)

    await api(page, 'DELETE', `/api/tickets/${ticket!.id}`, adminToken)
    await api(page, 'PUT', `/api/admin/users/${reqId}`, adminToken, { isActive: false })
  })
})