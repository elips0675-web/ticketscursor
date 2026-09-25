import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { generateSecret, generateSync } from 'otplib'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { isFeatureEnabled } from '../feature-flags.js'

// Этап 63 (подфича 1) — 2FA/TOTP:
//  - двухшаговый логин (step='2fa' + tempToken) при включённом TOTP;
//  - /2fa/verify, /2fa/status, /2fa/setup|enable|disable;
//  - middleware require2FA на /api/admin/* (флаг two_fa=on) — admin без TOTP получает 403.
// Изоляция от общего seed-сета: выделенный админ id 600 (никто больше его не трогает),
// флаг two_fa замокан per-file (влияет только на этот файл, не ломает api.test.js).
// Коды TOTP генерируются тем же секретом через otplib (действительны 30с — не флаки).
vi.mock('../feature-flags.js', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
  invalidateFeatureFlagCache: vi.fn(),
}))

const ADMIN_EMAIL = 'twofa-admin@example.com'
const ADMIN_PASSWORD = '123456'
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')

// admin-token указывает на выделенного админа (600); agent — на seed-юзера 3 (не модифицируем его).
const adminToken = jwt.sign({ userId: 600, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
const agentToken = jwt.sign({ userId: 3, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' })

async function cleanup() {
  await prisma.user_totp.deleteMany({ where: { user_id: 600 } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: 600 } })
}

beforeAll(async () => {
  await prisma.employees.deleteMany({ where: { id: 600 } })
  await prisma.employees.create({
    data: {
      id: 600,
      name: 'TwoFA Admin',
      email: ADMIN_EMAIL,
      password_hash: PASSWORD_HASH,
      role: 'admin',
      department: 'Тесты',
      online: true,
      active_tickets: 0,
      resolved_today: 0,
    },
  })
})

beforeEach(async () => {
  await cleanup()
  vi.mocked(isFeatureEnabled).mockResolvedValue(false)
})

afterAll(async () => {
  await cleanup()
  await prisma.employees.deleteMany({ where: { id: 600 } })
})

describe('2FA/TOTP (Этап 63, подфича 1)', () => {
  it('login без TOTP: обычный вход, require2faSetup=false при выключенном флаге', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.employee.email).toBe(ADMIN_EMAIL)
    expect(res.body.data.require2faSetup).toBe(false)
  })

  it('при включённом TOTP логин возвращает step=2fa + tempToken (без JWT)', async () => {
    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: true } })

    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.step).toBe('2fa')
    expect(res.body.tempToken).toBeTruthy()
    expect(res.body.data).toBeUndefined()
  })

  it('2fa/verify с корректным кодом выдаёт JWT + employee', async () => {
    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: true } })

    const login = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    const code = generateSync({ secret })
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: login.body.tempToken, code })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.employee.email).toBe(ADMIN_EMAIL)
  })

  it('2fa/verify с неверным кодом → 401 INVALID_2FA', async () => {
    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: true } })

    const login = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: login.body.tempToken, code: '000000' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_2FA')
  })

  it('2fa/verify с подделанным/просроченным tempToken → 401', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: 'not-a-jwt', code: '123456' })
    expect(res.status).toBe(401)
  })

  it('2fa/setup: админ получает secret + otpauthUrl; повторный вызов обновляет секрет', async () => {
    const first = await request(app).post('/api/auth/2fa/setup').set('Authorization', `Bearer ${adminToken}`)
    expect(first.status).toBe(200)
    expect(first.body.data.secret).toBeTruthy()
    expect(first.body.data.otpauthUrl).toContain('otpauth://totp/')
    expect(first.body.data.otpauthUrl).toContain(encodeURIComponent(ADMIN_EMAIL))

    const row = await prisma.user_totp.findUnique({ where: { user_id: 600 } })
    expect(row.enabled).toBe(false)

    const second = await request(app).post('/api/auth/2fa/setup').set('Authorization', `Bearer ${adminToken}`)
    expect(second.status).toBe(200)
    expect(second.body.data.secret).not.toBe(first.body.data.secret)
  })

  it('2fa/setup: не-админ (agent) → 403', async () => {
    const res = await request(app).post('/api/auth/2fa/setup').set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('2fa/enable: неверный код → 401, верный → enabled=true', async () => {
    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: false } })

    const bad = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: '111111' })
    expect(bad.status).toBe(401)

    const code = generateSync({ secret })
    const good = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code })
    expect(good.status).toBe(200)
    expect(good.body.data.enabled).toBe(true)

    const row = await prisma.user_totp.findUnique({ where: { user_id: 600 } })
    expect(row.enabled).toBe(true)
  })

  it('2fa/disable: верный код отключает 2FA', async () => {
    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: true } })

    const code = generateSync({ secret })
    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code })
    expect(res.status).toBe(200)
    expect(res.body.data.enabled).toBe(false)

    const row = await prisma.user_totp.findUnique({ where: { user_id: 600 } })
    expect(row.enabled).toBe(false)
  })

  it('2fa/status: enabled/secretSet/required отражают состояние', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true)
    const empty = await request(app).get('/api/auth/2fa/status').set('Authorization', `Bearer ${adminToken}`)
    expect(empty.status).toBe(200)
    expect(empty.body.data).toEqual({ enabled: false, secretSet: false, required: true })

    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: true } })
    const on = await request(app).get('/api/auth/2fa/status').set('Authorization', `Bearer ${adminToken}`)
    expect(on.body.data.enabled).toBe(true)
    expect(on.body.data.secretSet).toBe(true)
  })

  it('require2FA: флаг two_fa=on, админ без TOTP → 403 на /api/admin/*', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true)
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('2FA_REQUIRED')
  })

  it('require2FA: флаг two_fa=off → админ работает без 2FA', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false)
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })

  it('require2FA: админ с включённым TOTP проходит при флаге on', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true)
    const secret = generateSecret()
    await prisma.user_totp.create({ data: { user_id: 600, secret, enabled: true } })
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })

  it('require2FA: GET /features не блокируется (админ может включить 2FA через админку)', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true)
    const res = await request(app).get('/api/admin/features').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})