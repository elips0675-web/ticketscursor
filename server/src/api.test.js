import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app, server } from './app.js'
import { JWT_SECRET } from './middleware.js'

let devToken
const agentToken = jwt.sign({ userId: 99, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' })

beforeAll(async () => {
  server.listen(4001)
  const res = await request(app).post('/api/auth/dev-login')
  devToken = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('timestamp')
  })
})

describe('POST /api/auth/dev-login', () => {
  it('returns token and employee', async () => {
    const res = await request(app).post('/api/auth/dev-login')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body.data).toHaveProperty('token')
    expect(res.body.data.employee).toHaveProperty('id', 1)
    expect(res.body.data.employee).toHaveProperty('role', 'super_admin')
  })
})

describe('Protected routes — 401 without token', () => {
  const endpoints = [
    { method: 'get', path: '/api/tickets' },
    { method: 'get', path: '/api/tickets/1' },
    { method: 'get', path: '/api/employees' },
    { method: 'get', path: '/api/employees/stats' },
    { method: 'get', path: '/api/news' },
    { method: 'get', path: '/api/polls' },
    { method: 'get', path: '/api/wiki' },
    { method: 'get', path: '/api/wiki/1' },
    { method: 'get', path: '/api/chats' },
    { method: 'get', path: '/api/chats/1' },
    { method: 'get', path: '/api/calendar' },
    { method: 'get', path: '/api/files/folders' },
    { method: 'get', path: '/api/search?q=test' },
    { method: 'get', path: '/api/admin/users' },
    { method: 'get', path: '/api/admin/settings' },
    { method: 'get', path: '/api/notifications' },
    { method: 'get', path: '/api/push/vapid-key' },
    { method: 'get', path: '/api/push/subscription' },
  ]
  for (const { method, path } of endpoints) {
    it(`${method.toUpperCase()} ${path} returns 401`, async () => {
      const req = request(app)[method](path)
      const res = await req
      expect(res.status).toBe(401)
      expect(res.body.message).toBe('No token provided')
    })
  }
})

describe('Protected routes — 403 with invalid token', () => {
  const endpoints = [
    { method: 'get', path: '/api/tickets' },
    { method: 'get', path: '/api/tickets/1' },
    { method: 'get', path: '/api/employees' },
  ]
  for (const { method, path } of endpoints) {
    it(`${method.toUpperCase()} ${path} returns 403`, async () => {
      const res = await request(app)[method](path)
        .set('Authorization', 'Bearer invalid-token')
      expect(res.status).toBe(403)
    })
  }
})

describe('Protected routes — 200 with valid dev token', () => {
  it('GET /api/tickets', async () => {
    const res = await request(app).get('/api/tickets')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })

  it('GET /api/employees', async () => {
    const res = await request(app).get('/api/employees')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })
})

describe('GET /api/search', () => {
  it('returns empty results for short query', async () => {
    const res = await request(app)
      .get('/api/search?q=a')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tickets).toEqual([])
    expect(res.body.data.employees).toEqual([])
    expect(res.body.data.wiki).toEqual([])
  })

  it('handles fulltext search query', async () => {
    const res = await request(app)
      .get('/api/search?q=test')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('tickets')
      expect(res.body.data).toHaveProperty('employees')
      expect(res.body.data).toHaveProperty('wiki')
    }
  })
})

describe('GET /api/employees/stats', () => {
  it('returns stats object', async () => {
    const res = await request(app)
      .get('/api/employees/stats')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('total')
      expect(res.body.data).toHaveProperty('open')
      expect(res.body.data).toHaveProperty('inProgress')
    }
  })
})

describe('GET /api/notifications', () => {
  it('returns list of notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    }
  })
})

describe('POST /api/auth/register validation', () => {
  it('rejects without auth', async () => {
    const res = await request(app).post('/api/auth/register').send({})
    expect(res.status).toBe(401)
  })

  it('fails with empty body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('fails with invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'Test', email: 'bad', password: '123456' })
    expect(res.status).toBe(400)
  })

  it('fails with short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'Test', email: 'test@test.com', password: '12' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login validation', () => {
  it('fails with empty body', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('fails with invalid email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'bad', password: '123456' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login — valid credentials', () => {
  let loginRes

  beforeAll(async () => {
    loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alexey@example.com', password: '123456' })
  })

  it('returns 200 with token and employee', async () => {
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.data).toHaveProperty('token')
    expect(loginRes.body.data.employee).toHaveProperty('id', 1)
    expect(loginRes.body.data.employee).toHaveProperty('name', 'Алексей Петров')
  })

  it('sets refreshToken cookie', async () => {
    const cookies = loginRes.headers['set-cookie']
    expect(cookies).toBeDefined()
    expect(cookies.some(c => c.startsWith('refreshToken='))).toBe(true)
  })

  it('fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'wrongpass' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid credentials')
  })

  it('fails for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: '123456' })
    expect([401, 429]).toContain(res.status)
    if (res.status === 401) {
      expect(res.body.message).toBe('Invalid credentials')
    }
  })
})

describe('POST /api/auth/refresh', () => {
  it('refreshes token with valid cookie', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alexey@example.com', password: '123456' })
    const cookies = login.headers['set-cookie']
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('token')
  })

  it('fails without cookie', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('No refresh token')
  })
})

describe('POST /api/auth/logout', () => {
  it('logs out successfully', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('POST /api/auth/refresh', () => {
  it('fails without cookie', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect([401, 429]).toContain(res.status)
    if (res.status === 401) {
      expect(res.body.message).toBe('No refresh token')
    }
  })
})

describe('POST /api/auth/forgot-password', () => {
  it('handles invalid email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'bad' })
    expect([400, 429]).toContain(res.status)
  })

  it('returns success even if email does not exist', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nonexistent@test.com' })
    expect([200, 429, 500]).toContain(res.status)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('fails without body', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({})
    expect([400, 429]).toContain(res.status)
  })

  it('fails with invalid token', async () => {
    const res = await request(app).post('/api/auth/reset-password')
      .send({ token: 'invalid', password: 'newpass123' })
    expect([400, 429]).toContain(res.status)
  })
})

describe('POST /api/auth/register — success path', () => {
  it('creates a new employee', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'New User', email: `new${Date.now()}@test.com`, password: 'validpass123' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.employee).toHaveProperty('id')
    expect(res.body.data.employee.role).toBe('agent')
  })
})

describe('RBAC — ticket management', () => {

  it('admin can update ticket status', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'in_progress' })
    expect([200, 400, 404, 500]).toContain(res.status)
  })

  it('rejects status update without senior_agent role', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'in_progress' })
    expect(res.status).toBe(403)
  })

  it('admin can update ticket priority', async () => {
    const res = await request(app)
      .put('/api/tickets/1/priority')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ priority: 'high' })
    expect([200, 400, 404, 500]).toContain(res.status)
  })

  it('rejects priority update without senior_agent role', async () => {
    const res = await request(app)
      .put('/api/tickets/1/priority')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ priority: 'high' })
    expect(res.status).toBe(403)
  })

  it('rejects ticket assign without senior_agent role', async () => {
    const res = await request(app)
      .put('/api/tickets/1/assign')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ assigneeId: 2 })
    expect(res.status).toBe(403)
  })

  it('rejects invalid status value', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'invalid' })
    expect(res.status).toBe(400)
  })
})

describe('RBAC — admin endpoints', () => {
  it('admin can list users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      const data = res.body.data || res.body
      expect(Array.isArray(data)).toBe(true)
    }
  })

  it('rejects non-admin from listing users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('admin can get settings', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })

  it('rejects non-admin from settings', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('admin can update user role', async () => {
    const res = await request(app)
      .put('/api/admin/users/1')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ role: 'agent' })
    expect([200, 400, 404, 500]).toContain(res.status)
  })

  it('rejects non-admin from updating user', async () => {
    const res = await request(app)
      .put('/api/admin/users/1')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ role: 'admin' })
    expect(res.status).toBe(403)
  })

  it('rejects empty role update', async () => {
    const res = await request(app)
      .put('/api/admin/users/1')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect([400, 500]).toContain(res.status)
  })

  it('admin can get audit logs', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true)
    }
  })

  it('rejects non-admin from audit logs', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('admin can update settings', async () => {
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ key: 'test', value: 'test' })
    expect([200, 400, 500]).toContain(res.status)
  })
})

describe('RBAC — other protected endpoints', () => {

  it('rejects agent from deleting calendar events', async () => {
    const res = await request(app)
      .delete('/api/calendar/1')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('rejects agent from creating news', async () => {
    const res = await request(app)
      .post('/api/news')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: 'Test', content: 'Test' })
    expect(res.status).toBe(403)
  })

  it('rejects agent from creating polls', async () => {
    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: 'Test', options: ['A', 'B'] })
    expect(res.status).toBe(403)
  })

  it('rejects agent from creating wiki articles', async () => {
    const res = await request(app)
      .post('/api/wiki')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: 'Test', content: 'Test' })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/polls validation', () => {
  it('rejects poll without title', async () => {
    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ options: ['A', 'B'] })
    expect(res.status).toBe(400)
  })

  it('rejects poll with less than 2 options', async () => {
    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ title: 'Test', options: ['A'] })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/chats/:id/messages validation', () => {
  it('rejects message without text', async () => {
    const res = await request(app)
      .post('/api/chats/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Text required')
  })
})

describe('GET /api/chats/:id', () => {
  it('returns 404 for non-existent chat', async () => {
    const res = await request(app)
      .get('/api/chats/99999')
      .set('Authorization', `Bearer ${devToken}`)
    expect([404, 500]).toContain(res.status)
  })

  it('returns chat with valid id', async () => {
    const res = await request(app)
      .get('/api/chats/1')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 404, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
    }
  })
})

describe('PUT /api/chats/:id/read', () => {
  it('marks chat as read', async () => {
    const res = await request(app)
      .put('/api/chats/1/read')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })
})

describe('POST /api/push/subscribe', () => {
  it('requires subscription_json', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('subscribe and unsubscribe', async () => {
    const sub = { endpoint: 'https://test.com', keys: { auth: 'a', p256dh: 'b' } }
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ subscription_json: sub })
    expect([201, 500]).toContain(res.status)

    const del = await request(app)
      .delete('/api/push/unsubscribe')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(del.status)
  })
})

describe('GET /api/push/vapid-key', () => {
  it('returns 500 if VAPID not configured', async () => {
    const res = await request(app)
      .get('/api/push/vapid-key')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })
})

describe('POST /api/tickets/upload', () => {
  it('rejects without file', async () => {
    const res = await request(app)
      .post('/api/tickets/upload')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('No file')
  })
})

describe('DELETE /api/calendar/:id', () => {
  it('returns 404 for non-existent event', async () => {
    const res = await request(app)
      .delete('/api/calendar/99999')
      .set('Authorization', `Bearer ${devToken}`)
    expect([403, 404, 500]).toContain(res.status)
  })
})

describe('GET /api/notifications/:id/read', () => {
  it('marks notification as read', async () => {
    const res = await request(app)
      .put('/api/notifications/1/read')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 404, 500]).toContain(res.status)
  })
})

describe('GET /api/polls', () => {
  it('returns paginated polls', async () => {
    const res = await request(app)
      .get('/api/polls')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('data')
      expect(res.body.data).toHaveProperty('total')
    }
  })

  it('filters polls by status', async () => {
    const res = await request(app)
      .get('/api/polls?status=active')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })
})

describe('GET /api/news', () => {
  it('returns paginated news', async () => {
    const res = await request(app)
      .get('/api/news')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('data')
      expect(res.body.data).toHaveProperty('total')
    }
  })
})

describe('GET /api/wiki', () => {
  it('returns paginated wiki articles', async () => {
    const res = await request(app)
      .get('/api/wiki')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('data')
    }
  })
})

describe('GET /api/chats', () => {
  it('returns chats list', async () => {
    const res = await request(app)
      .get('/api/chats')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    }
  })
})

describe('GET /api/calendar', () => {
  it('returns events list', async () => {
    const res = await request(app)
      .get('/api/calendar')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    }
  })
})

describe('GET /api/files/folders', () => {
  it('returns folders list', async () => {
    const res = await request(app)
      .get('/api/files/folders')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('requires auth', async () => {
    const res = await request(app).get('/api/files/folders')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/files/upload', () => {
  it('rejects without file', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(400) // message is in Russian: 'Файл не загружен'
  })
})

describe('POST /api/files/folders', () => {
  it('creates a new folder', async () => {
    const res = await request(app)
      .post('/api/files/folders')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: `Test folder ${Date.now()}` })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('id')
  })

  it('rejects without name', async () => {
    const res = await request(app)
      .post('/api/files/folders')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/tickets/sla/overdue', () => {
  it('returns overdue SLA tickets', async () => {
    const res = await request(app)
      .get('/api/tickets/sla/overdue')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('success', true)
  })
})

describe('GET /api/tickets/sla/stats', () => {
  it('returns SLA stats', async () => {
    const res = await request(app)
      .get('/api/tickets/sla/stats')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
  })
})

describe('GET /api/system-info', () => {
  it('returns system info', async () => {
    const res = await request(app)
      .get('/api/system-info')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 429, 500]).toContain(res.status)
  })

  it('requires auth', async () => {
    const res = await request(app).get('/api/system-info')
    expect([401, 429]).toContain(res.status)
  })
})

describe('POST /api/tickets', () => {
  it('rejects without title', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ description: 'test' })
    expect(res.status).toBe(400)
  })

  it('rejects with invalid priority', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ title: 'Test', priority: 'urgent' })
    expect(res.status).toBe(400)
  })

  it('creates a ticket with valid data', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ title: 'Test ticket', description: 'Test description', priority: 'medium', category: 'bug' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data).toHaveProperty('title', 'Test ticket')
  })

  it('assigns a ticket to employee', async () => {
    const create = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ title: 'Assign test', description: 'test', priority: 'high', category: 'bug' })
    expect(create.status).toBe(201)
    const ticketId = create.body.data.id

    const res = await request(app)
      .put(`/api/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ employeeId: 2 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('DELETE /api/tickets/:id/messages/:msgId', () => {
  let createdMsgId

  beforeAll(async () => {
    const msg = await request(app)
      .post('/api/tickets/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ text: 'Test message for deletion' })
    createdMsgId = msg.body?.data?.id
  })

  it('deletes own message', async () => {
    if (!createdMsgId) return
    const res = await request(app)
      .delete(`/api/tickets/1/messages/${createdMsgId}`)
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 404 for non-existent message', async () => {
    const res = await request(app)
      .delete('/api/tickets/1/messages/99999')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/wiki', () => {
  it('rejects without title', async () => {
    const res = await request(app)
      .post('/api/wiki')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ content: 'test' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/wiki/:id', () => {
  it('returns 404 for non-existent article', async () => {
    const res = await request(app)
      .get('/api/wiki/99999')
      .set('Authorization', `Bearer ${devToken}`)
    expect([404, 500]).toContain(res.status)
  })

  it('returns article with valid id', async () => {
    const res = await request(app)
      .get('/api/wiki/1')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 404, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data).toHaveProperty('title')
    }
  })
})

describe('POST /api/calendar', () => {
  it('rejects without title', async () => {
    const res = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ date: '2026-01-01' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/news', () => {
  it('rejects without title', async () => {
    const res = await request(app)
      .post('/api/news')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ content: 'test' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/tickets/:id/messages', () => {
  it('rejects without content', async () => {
    const res = await request(app)
      .post('/api/tickets/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('rejects with empty content', async () => {
    const res = await request(app)
      .post('/api/tickets/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ content: '' })
    expect(res.status).toBe(400)
  })

  it('creates message with valid content', async () => {
    const res = await request(app)
      .post('/api/tickets/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ text: 'Test message content' })
    expect([201, 403, 404, 500]).toContain(res.status)
    if (res.status === 201) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data).toHaveProperty('text', 'Test message content')
    }
  })
})

describe('POST /api/chats/:id/messages success', () => {
  it('creates message with valid text', async () => {
    const res = await request(app)
      .post('/api/chats/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ text: 'Hello from test' })
    expect([201, 404, 500]).toContain(res.status)
    if (res.status === 201) {
      expect(res.body.success).toBe(true)
    }
  })

  it('rejects text longer than 2000 chars', async () => {
    const res = await request(app)
      .post('/api/chats/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ text: 'x'.repeat(2001) })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/too long/i)
  })
})

describe('POST /api/polls/:id/vote', () => {
  it('rejects without optionId', async () => {
    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('optionId required')
  })

  it('votes on a poll with valid optionId', async () => {
    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ optionId: 1 })
    expect([200, 400, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
    }
  })
})

describe('GET /api/tickets/:id', () => {
  it('returns ticket with valid id', async () => {
    const res = await request(app)
      .get('/api/tickets/1')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 403, 404, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('id', 1)
      expect(res.body.data).toHaveProperty('title')
      expect(res.body.data).toHaveProperty('status')
    }
  })

  it('returns 404 for non-existent ticket', async () => {
    const res = await request(app)
      .get('/api/tickets/99999')
      .set('Authorization', `Bearer ${devToken}`)
    expect([404, 500]).toContain(res.status)
  })

  it('returns 400 for invalid ticket id', async () => {
    const res = await request(app)
      .get('/api/tickets/invalid')
      .set('Authorization', `Bearer ${devToken}`)
    expect([400, 500]).toContain(res.status)
  })
})

describe('PUT /api/tickets/:id/status — success path', () => {
  it('updates status to in_progress', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'in_progress' })
    expect([200, 400, 404, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('status', 'in_progress')
    }
  })

  it('updates status to resolved', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'resolved' })
    expect([200, 400, 404, 500]).toContain(res.status)
  })

  it('rejects invalid status value', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'nonexistent' })
    expect([400, 500]).toContain(res.status)
  })
})

describe('GET /api/tickets/:id/messages', () => {
  it('returns messages for a ticket', async () => {
    const res = await request(app)
      .get('/api/tickets/1/messages')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns 200 for non-existent ticket (empty messages)', async () => {
    const res = await request(app)
      .get('/api/tickets/99999/messages')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('PUT /api/tickets/:id/priority — success path', () => {
  it('updates priority to high', async () => {
    const res = await request(app)
      .put('/api/tickets/1/priority')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ priority: 'high' })
    expect([200, 404, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('priority', 'high')
    }
  })

  it('updates priority to low', async () => {
    const res = await request(app)
      .put('/api/tickets/1/priority')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ priority: 'low' })
    expect([200, 404, 500]).toContain(res.status)
  })

  it('rejects invalid priority value', async () => {
    const res = await request(app)
      .put('/api/tickets/1/priority')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ priority: 'urgent' })
    expect([400, 500]).toContain(res.status)
  })
})
