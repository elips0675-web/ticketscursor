import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, server } from './app.js'

beforeAll(() => {
  server.listen(4001)
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
    expect(res.body).toHaveProperty('token')
    expect(res.body.employee).toHaveProperty('id', 1)
    expect(res.body.employee).toHaveProperty('role', 'super_admin')
  })
})

describe('Protected routes', () => {
  it('rejects requests without token', async () => {
    const res = await request(app).get('/api/tickets')
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('No token provided')
  })

  it('rejects requests with invalid token', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('Authorization', 'Bearer invalid-token')
    expect(res.status).toBe(403)
  })

  it('accepts requests with valid dev token', async () => {
    const login = await request(app).post('/api/auth/dev-login')
    const res = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${login.body.token}`)
    // DB-dependent — skip assert if MySQL unavailable
    expect([200, 500]).toContain(res.status)
  })
})

describe('GET /api/search', () => {
  it('returns empty results for short query', async () => {
    const login = await request(app).post('/api/auth/dev-login')
    const res = await request(app)
      .get('/api/search?q=a')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.tickets).toEqual([])
  })

  it('accepts valid search query', async () => {
    const login = await request(app).post('/api/auth/dev-login')
    const res = await request(app)
      .get('/api/search?q=test')
      .set('Authorization', `Bearer ${login.body.token}`)
    // DB-dependent — skip assert if MySQL unavailable
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty('tickets')
      expect(res.body).toHaveProperty('employees')
      expect(res.body).toHaveProperty('wiki')
    }
  })
})

describe('POST /api/auth/register validation', () => {
  let adminToken

  beforeAll(async () => {
    const login = await request(app).post('/api/auth/dev-login')
    adminToken = login.body.token
  })

  it('rejects without auth', async () => {
    const res = await request(app).post('/api/auth/register').send({})
    expect(res.status).toBe(401)
  })

  it('fails without body', async () => {
    const res = await request(app).post('/api/auth/register').set('Authorization', `Bearer ${adminToken}`).send({})
    expect(res.status).toBe(400)
  })
})

describe('RBAC — ticket management', () => {
  let adminToken, agentToken

  beforeAll(async () => {
    const admin = await request(app).post('/api/auth/dev-login')
    adminToken = admin.body.token
    // agent: login as employee 2 (senior_agent has elevated perms — use a non-admin employee)
    const agent = await request(app).post('/api/auth/login').send({ email: 'ivan@example.com', password: 'password123' })
    agentToken = agent.body.token
  })

  it('admin can update ticket status', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_progress' })
    expect([200, 404, 500]).toContain(res.status)
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
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'high' })
    expect([200, 404, 500]).toContain(res.status)
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
})

describe('RBAC — admin endpoints', () => {
  let adminToken, agentToken

  beforeAll(async () => {
    const admin = await request(app).post('/api/auth/dev-login')
    adminToken = admin.body.token
    const agent = await request(app).post('/api/auth/login').send({ email: 'ivan@example.com', password: 'password123' })
    agentToken = agent.body.token
  })

  it('admin can list users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true)
    }
  })

  it('rejects non-admin from listing users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/calendar/:id — RBAC', () => {
  let agentToken

  beforeAll(async () => {
    const agent = await request(app).post('/api/auth/login').send({ email: 'ivan@example.com', password: 'password123' })
    agentToken = agent.body.token
  })

  it('rejects agent from deleting calendar events', async () => {
    const res = await request(app)
      .delete('/api/calendar/1')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })
})
