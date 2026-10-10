// P1 №12: деструктивные админ-операции (seed/backup/geo/restore) заблокированы в проде (NODE_ENV=production).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, server } from '../app.js'

let token
const OPS = ['seed', 'backup', 'geo', 'restore']

beforeAll(async () => {
  server.listen(4009)
  const res = await request(app).post('/api/auth/dev-login')
  token = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

describe('POST /api/admin/settings/{seed,backup,geo,restore} — guard NODE_ENV=production (P1 №12)', () => {
  it.each(OPS)('%s в проде → 403 DISABLED_IN_PRODUCTION (не запускается)', async (op) => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await request(app).post(`/api/admin/settings/${op}`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('DISABLED_IN_PRODUCTION')
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('без токена → 401 даже в проде', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await request(app).post('/api/admin/settings/seed')
      expect(res.status).toBe(401)
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})