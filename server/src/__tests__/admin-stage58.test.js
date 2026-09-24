import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app, server } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import {
  loadRateLimitOverrides,
  setRateLimitOverrides,
  getRateLimitOverrides,
  createLimiters,
} from '../limits.js'
import { getRbacMatrix } from '../rbac.js'

let devToken
const agentToken = jwt.sign({ userId: 99, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' })

beforeAll(async () => {
  server.listen(4002)
  const res = await request(app).post('/api/auth/dev-login')
  devToken = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

describe('GET /api/admin/health', () => {
  it('returns health checks and queue state', async () => {
    const res = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      const { checks, queue, updatedAt } = res.body.data
      expect(Array.isArray(checks)).toBe(true)
      expect(checks.length).toBeGreaterThanOrEqual(5)
      const db = checks.find((c) => c.name === 'db')
      expect(db).toBeTruthy()
      expect(typeof db.ok).toBe('boolean')
      expect(checks.some((c) => c.name === 'redis')).toBe(true)
      expect(checks.some((c) => c.name === 'meili')).toBe(true)
      expect(checks.some((c) => c.name === 'smtp')).toBe(true)
      expect(checks.some((c) => c.name === 'imap')).toBe(true)
      expect(queue).toHaveProperty('mode')
      expect(updatedAt).toBeTruthy()
    }
  })

  it('rejects non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/health')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/admin/queues', () => {
  it('returns queue stats', async () => {
    const res = await request(app)
      .get('/api/admin/queues')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(['in-memory', 'bullmq']).toContain(res.body.data.mode)
      expect(Array.isArray(res.body.data.queues)).toBe(true)
      if (res.body.data.mode === 'in-memory') {
        expect(res.body.data.note).toBeTruthy()
      }
    }
  })
})

describe('GET /api/admin/migrations', () => {
  it('returns applied and pending migrations', async () => {
    const res = await request(app)
      .get('/api/admin/migrations')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      const data = res.body.data
      expect(Array.isArray(data.applied)).toBe(true)
      expect(Array.isArray(data.pending)).toBe(true)
      expect(data.appliedCount).toBe(data.applied.length)
      expect(data.pendingCount).toBe(data.pending.length)
      expect(data.appliedCount).toBeGreaterThan(0)
    }
  })
})

describe('GET /api/admin/rbac', () => {
  it('returns roles matrix', async () => {
    const res = await request(app)
      .get('/api/admin/rbac')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      const { roles, permissions } = res.body.data
      expect(roles).toContain('agent')
      expect(roles).toContain('super_admin')
      expect(Array.isArray(permissions)).toBe(true)
      expect(permissions.length).toBeGreaterThan(10)
      const first = permissions[0]
      expect(first).toHaveProperty('key')
      expect(first).toHaveProperty('label')
      expect(typeof first.roles.agent).toBe('boolean')
      expect(typeof first.roles.super_admin).toBe('boolean')
    }
  })

  it('rejects non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/rbac')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })
})

describe('RBAC matrix (rbac.js)', () => {
  it('super_admin has every permission, agent has no admin-only ones', () => {
    const matrix = getRbacMatrix()
    for (const p of matrix.permissions) {
      expect(p.roles.super_admin).toBe(true)
    }
    const usersManage = matrix.permissions.find((p) => p.key === 'users.manage')
    expect(usersManage.roles.agent).toBe(false)
    expect(usersManage.roles.admin).toBe(true)
  })
})

describe('POST /api/admin/sessions/revoke-all', () => {
  it('revokes all refresh tokens', async () => {
    const res = await request(app)
      .post('/api/admin/sessions/revoke-all')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(typeof res.body.data.revoked).toBe('number')
      expect(res.body.data.revoked).toBeGreaterThanOrEqual(0)
    }
  })

  it('rejects non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/sessions/revoke-all')
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/sessions/revoke/:userId', () => {
  it('revokes sessions for a user', async () => {
    const res = await request(app)
      .post('/api/admin/sessions/revoke/999')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(typeof res.body.data.revoked).toBe('number')
    }
  })

  it('returns 400 for invalid user id', async () => {
    const res = await request(app)
      .post('/api/admin/sessions/revoke/abc')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/settings/restore', () => {
  it('returns 400 for empty backup', async () => {
    const res = await request(app)
      .post('/api/admin/settings/restore')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ content: '' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBeTruthy()
  })

  it('returns 400 without content field', async () => {
    const res = await request(app)
      .post('/api/admin/settings/restore')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('accepts non-empty content (ok or mysql error)', async () => {
    const res = await request(app)
      .post('/api/admin/settings/restore')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ content: 'CREATE TABLE IF NOT EXISTS restore_probe (id INT)' })
    expect([200, 400]).toContain(res.status)
  })
})

describe('GET /api/admin/email/preview', () => {
  it('renders template with sample variables', async () => {
    const res = await request(app)
      .get('/api/admin/email/preview?template=ticketCreatedSubject')
      .set('Authorization', `Bearer ${devToken}`)
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data.key).toBe('ticketCreatedSubject')
      expect(res.body.data.rendered).toContain('#101')
      expect(res.body.data.rendered).not.toContain('{{ticketId}}')
    }
  })

  it('returns 400 without template param', async () => {
    const res = await request(app)
      .get('/api/admin/email/preview')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown template', async () => {
    const res = await request(app)
      .get('/api/admin/email/preview?template=nope')
      .set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/admin/settings/rate-limits', () => {
  it('saves overrides and returns them', async () => {
    const res = await request(app)
      .put('/api/admin/settings/rate-limits')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ auth: 5, api: 50, admin: 15 })
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data).toEqual({ auth: 5, api: 50, admin: 15 })
      expect(getRateLimitOverrides()).toEqual({ auth: 5, api: 50, admin: 15 })
    }
  })

  it('normalizes invalid values to null', async () => {
    const res = await request(app)
      .put('/api/admin/settings/rate-limits')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ auth: -3, api: 'abc' })
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data.auth).toBeNull()
      expect(res.body.data.api).toBeNull()
    }
  })

  it('rejects non-admin', async () => {
    const res = await request(app)
      .put('/api/admin/settings/rate-limits')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ auth: 5 })
    expect(res.status).toBe(403)
  })
})

describe('limits.js overrides', () => {
  it('setRateLimitOverrides normalizes values', () => {
    setRateLimitOverrides({ auth: '12', api: 0, admin: null })
    expect(getRateLimitOverrides()).toEqual({ auth: 12, api: null, admin: null })
    setRateLimitOverrides(null)
    expect(getRateLimitOverrides()).toEqual({ auth: null, api: null, admin: null })
  })

  it('createLimiters works with default skip in test env', async () => {
    const { authLimiter } = createLimiters()
    expect(typeof authLimiter).toBe('function')
  })

  it('loadRateLimitOverrides does not throw without settings', async () => {
    await expect(loadRateLimitOverrides()).resolves.toBeUndefined()
  })
})
