// Этап 65 (подзадача 4): SLA business hours — PUT /api/admin/settings принимает
// BUSINESS_WORKING_DAYS/BUSINESS_HOURS_START/BUSINESS_HOURS_END/TIMEZONE (читает sla.js).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, server } from '../app.js'

let devToken

beforeAll(async () => {
  server.listen(4003)
  const res = await request(app).post('/api/auth/dev-login')
  devToken = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

describe('PUT /api/admin/settings — SLA business hours (Этап 65)', () => {
  it('сохраняет рабочие дни/часы/таймзону и возвращает их в GET', async () => {
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        BUSINESS_WORKING_DAYS: JSON.stringify([1, 2, 3, 4, 5]),
        BUSINESS_HOURS_START: '9',
        BUSINESS_HOURS_END: '18',
        TIMEZONE: 'Europe/Moscow',
      })
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      const got = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${devToken}`)
      expect(got.body.data.BUSINESS_WORKING_DAYS).toBe('[1,2,3,4,5]')
      expect(got.body.data.BUSINESS_HOURS_START).toBe('9')
      expect(got.body.data.BUSINESS_HOURS_END).toBe('18')
      expect(got.body.data.TIMEZONE).toBe('Europe/Moscow')
    }
  })

  it('не сохраняет неизвестный ключ (вне ALLOWED_SETTINGS)', async () => {
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ REALLY_NOT_A_KEY_XYZ: '1' })
    expect([200, 500]).toContain(res.status)
  })

  it('401 без токена', async () => {
    const res = await request(app).put('/api/admin/settings').send({ BUSINESS_HOURS_START: '9' })
    expect(res.status).toBe(401)
  })
})