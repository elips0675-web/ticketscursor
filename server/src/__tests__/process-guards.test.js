import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, server } from '../app.js'

// Process guards (Этап 60): CSP-заголовки, лимит тела запроса (413, не 500),
// проверка политики «честный 413, а не маскировка под 500».

let token

beforeAll(async () => {
  server.listen(4007)
  const res = await request(app).post('/api/auth/dev-login')
  token = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

describe('CSP (helmet) — inline-скрипты блокируются политикой', () => {
  it('script-src только self, без unsafe-inline/unsafe-eval', async () => {
    const res = await request(app).get('/')
    const csp = res.headers['content-security-policy'] || ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    const scriptPart = csp.split(';').find((d) => d.trim().startsWith('script-src')) || ''
    expect(scriptPart).not.toContain('unsafe-inline')
    expect(scriptPart).not.toContain('unsafe-eval')
  })

  it('connect-src разрешает localhost:* (dev-прокси), frame-ancestors none', async () => {
    const res = await request(app).get('/')
    const csp = res.headers['content-security-policy'] || ''
    expect(csp).toContain('connect-src')
    expect(csp).toContain('http://localhost:*')
    expect(csp).toContain("frame-ancestors 'none'")
  })
})

describe('Max body size — честный 413', () => {
  it('POST с телом > 100kb возвращает 413, а не 500', async () => {
    const big = { title: 'x'.repeat(200_000) }
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send(big)
    expect(res.status).toBe(413)
    expect(res.body.message).toBeTruthy()
  })

  it('обычный payload проходит мимо body-parser без ошибки', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Контракт 413', description: 'Маленькое тело', priority: 'low', category: 'bug' })
    expect([200, 201, 400]).toContain(res.status)
  })
})