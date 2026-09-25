import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { parseUserAgent } from '../auth/session-meta.js'

// Этап 63 (подфича 2) — активные сессии:
//  - login/refresh пишут device/ip/UA в refresh_tokens (storeRefreshToken);
//  - GET /auth/sessions — список своих сессий с пометкой current (по cookie);
//  - POST /auth/sessions/:id/revoke — отзыв своей НЕ-текущей сессии (400 на текущую, 404 на чужую/отсутствующую).
// Изоляция от общего seed: выделенный админ id 601 (никто больше его не трогает), реальный флаг user_sessions в тестах не нужен.
const ADMIN_EMAIL = 'sessions-admin@example.com'
const ADMIN_PASSWORD = '123456'
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')
const FOREIGN_EMAIL = 'sessions-foreign@example.com'

const adminToken = jwt.sign({ userId: 601, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
const foreignToken = jwt.sign({ userId: 602, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' })

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const FIREFOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0'

async function cleanup() {
  await prisma.refresh_tokens.deleteMany({ where: { user_id: 601 } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: 602 } })
  await prisma.employees.deleteMany({ where: { id: 602 } })
}

async function seedEmployee(id, email) {
  await prisma.employees.deleteMany({ where: { id } })
  return prisma.employees.create({
    data: {
      id,
      name: `User ${id}`,
      email,
      password_hash: PASSWORD_HASH,
      role: id === 601 ? 'admin' : 'agent',
      department: 'Тесты',
      online: true,
      active_tickets: 0,
      resolved_today: 0,
    },
  })
}

beforeAll(async () => {
  await prisma.employees.deleteMany({ where: { id: 601 } })
  await seedEmployee(601, ADMIN_EMAIL)
})

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.employees.deleteMany({ where: { id: 601 } })
})

function cookieFrom(res) {
  const setCookie = res.headers['set-cookie']
  if (!setCookie) return ''
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie]
  const c = parts[0]
  return c.split(';')[0]
}

describe('Активные сессии (Этап 63, подфича 2)', () => {
  it('login фиксирует device/ip/UA; GET /sessions возвращает сессию с current=true', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .set('User-Agent', CHROME_UA)
    expect(login.status).toBe(200)

    const row = await prisma.refresh_tokens.findFirst({ where: { user_id: 601 } })
    expect(row).toBeTruthy()
    expect(row.device_name).toContain('Chrome')
    expect(row.device_name).toContain('Windows')
    expect(row.ip_address).toBeTruthy()
    expect(row.last_seen_at).toBeTruthy()

    const list = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Cookie', cookieFrom(login))
    expect(list.status).toBe(200)
    expect(list.body.data.sessions).toHaveLength(1)
    expect(list.body.data.sessions[0].current).toBe(true)
    expect(list.body.data.sessions[0].device).toContain('Chrome')
  })

  it('GET /sessions без токена → 401', async () => {
    const list = await request(app).get('/api/auth/sessions')
    expect(list.status).toBe(401)
  })

  it('две сессии: список из 2, revoke одной → остаётся 1, повторный revoke → 404', async () => {
    const l1 = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .set('User-Agent', CHROME_UA)
    const l2 = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .set('User-Agent', FIREFOX_UA)
    expect(l1.status).toBe(200)
    expect(l2.status).toBe(200)

    const list = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Cookie', cookieFrom(l2))
    expect(list.status).toBe(200)
    expect(list.body.data.sessions).toHaveLength(2)
    const byDevice = Object.fromEntries(list.body.data.sessions.map((s) => [s.device, s]))
    expect(byDevice['Firefox · macOS'].current).toBe(true)
    expect(byDevice['Chrome · Windows'].current).toBe(false)

    const chromeId = byDevice['Chrome · Windows'].id
    const revoke = await request(app)
      .post(`/api/auth/sessions/${chromeId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(revoke.status).toBe(200)

    const after = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(after.body.data.sessions).toHaveLength(1)

    const again = await request(app)
      .post(`/api/auth/sessions/${chromeId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(again.status).toBe(404)
  })

  it('revoke текущей сессии → 400 (для этого есть /revoke-all)', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .set('User-Agent', CHROME_UA)
    const cookie = cookieFrom(login)
    const list = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Cookie', cookie)
    const id = list.body.data.sessions[0].id

    const revoke = await request(app)
      .post(`/api/auth/sessions/${id}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Cookie', cookie)
    expect(revoke.status).toBe(400)
  })

  it('revoke чужой сессии (другой пользователь) → 404', async () => {
    await seedEmployee(602, FOREIGN_EMAIL)
    await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .set('User-Agent', CHROME_UA)
    await request(app)
      .post('/api/auth/login')
      .send({ email: FOREIGN_EMAIL, password: ADMIN_PASSWORD })
      .set('User-Agent', FIREFOX_UA)
    const foreignRow = await prisma.refresh_tokens.findFirst({ where: { user_id: 602 } })
    const ownRow = await prisma.refresh_tokens.findFirst({ where: { user_id: 601 } })
    expect(foreignRow).toBeTruthy()
    expect(ownRow).toBeTruthy()

    // Токен 601 не может отозвать сессию 602 (чужую)
    const revoke = await request(app)
      .post(`/api/auth/sessions/${foreignRow.id}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(revoke.status).toBe(404)

    // Токен 602 не может отозвать сессию 601
    const revoke2 = await request(app)
      .post(`/api/auth/sessions/${ownRow.id}/revoke`)
      .set('Authorization', `Bearer ${foreignToken}`)
    expect(revoke2.status).toBe(404)
  })

  it('revoke с некорректным id → 400', async () => {
    const revoke = await request(app)
      .post('/api/auth/sessions/abc/revoke')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(revoke.status).toBe(400)
  })
})

describe('parseUserAgent (сессионные метаданные)', () => {
  it('Chrome на Windows', () => {
    const { device, isMobile } = parseUserAgent(CHROME_UA)
    expect(device).toBe('Chrome · Windows')
    expect(isMobile).toBe(false)
  })

  it('Firefox на macOS', () => {
    const { device, isMobile } = parseUserAgent(FIREFOX_UA)
    expect(device).toBe('Firefox · macOS')
    expect(isMobile).toBe(false)
  })

  it('мобильный Android', () => {
    const { device, isMobile } = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    )
    expect(device).toBe('Chrome · Android')
    expect(isMobile).toBe(true)
  })

  it('Edge, пустой/неизвестный UA', () => {
    const edge = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0')
    expect(edge.device).toBe('Edge · Windows')
    expect(parseUserAgent('').device).toBeTruthy()
  })
})