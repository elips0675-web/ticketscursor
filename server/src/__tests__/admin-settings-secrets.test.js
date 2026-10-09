// P1 №9: GET /api/admin/settings не отдаёт значения секретов (*PASS*/*SECRET*/*CREDENTIALS*/*TOKEN*),
// PUT с маской не затирает реальное значение.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, server } from '../app.js'

const SECRET_KEYS = ['SMTP_PASS', 'IMAP_PASS', 'SSO_CLIENT_SECRET', 'LDAP_BIND_CREDENTIALS', 'TELEGRAM_BOT_TOKEN']
const SECRET_MASK = '********'
const REAL_SECRET = 'real-secret-value-42'
let token

beforeAll(async () => {
  server.listen(4008)
  const res = await request(app).post('/api/auth/dev-login')
  token = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

const put = (body) => request(app).put('/api/admin/settings').set('Authorization', `Bearer ${token}`).send(body)
const get = () => request(app).get('/api/admin/settings').set('Authorization', `Bearer ${token}`)

describe('GET /api/admin/settings — секреты замаскированы (P1 №9)', () => {
  it('возвращает маску вместо значений секретных ключей', async () => {
    const saved = await put(Object.fromEntries(SECRET_KEYS.map((k) => [k, REAL_SECRET])))
    expect(saved.status).toBe(200)
    const res = await get()
    expect(res.status).toBe(200)
    for (const k of SECRET_KEYS) {
      expect(res.body.data[k]).toBe(SECRET_MASK)
    }
  })

  it('реальное значение секрета не встречается в ответе', async () => {
    await put({ SMTP_PASS: REAL_SECRET })
    const res = await get()
    expect(JSON.stringify(res.body)).not.toContain(REAL_SECRET)
  })

  it('обычные настройки не маскируются', async () => {
    await put({ SMTP_HOST: 'smtp.example.test' })
    const res = await get()
    expect(res.body.data.SMTP_HOST).toBe('smtp.example.test')
  })

  it('PUT с маской не затирает реальный секрет', async () => {
    const { getSettings, invalidateCache } = await import('../settings.js')
    await put({ SMTP_PASS: REAL_SECRET })
    await put({ SMTP_PASS: SECRET_MASK })
    invalidateCache()
    expect((await getSettings()).SMTP_PASS).toBe(REAL_SECRET)
  })

  it('PUT с новым значением сохраняет секрет', async () => {
    const { getSettings, invalidateCache } = await import('../settings.js')
    await put({ SMTP_PASS: 'new-secret-77' })
    invalidateCache()
    expect((await getSettings()).SMTP_PASS).toBe('new-secret-77')
  })

  it('пустой секрет не маскируется (видно, что не задан)', async () => {
    await put({ IMAP_PASS: '' })
    const res = await get()
    expect(res.body.data.IMAP_PASS).toBe('')
  })
})
