import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import {
  NOTIF_EVENTS,
  NOTIF_CHANNELS,
  defaultPrefs,
  normalizePrefs,
  mergePrefs,
  allowedUserIds,
  invalidateNotificationPrefsCache,
  getPrefsForUser,
} from '../notification-prefs.js'

// Этап 63 (подфича 3) — notification preferences (флаг notification_prefs):
//  - GET/PUT /api/notifications/preferences — каналы (email/push/in_app) × события;
//  - дефолт для пользователя без настроек — все включены (обратная совместимость);
//  - изоляция от общего seed: выделенные id 603 (admin) / 604 (agent).
const ADMIN_EMAIL = 'prefs-admin@example.com'
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')
const FOREIGN_EMAIL = 'prefs-foreign@example.com'

const adminToken = jwt.sign({ userId: 603, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
const foreignToken = jwt.sign({ userId: 604, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' })

async function cleanup() {
  await prisma.notification_preferences.deleteMany({ where: { user_id: { in: [603, 604] } } })
  await prisma.audit_log.deleteMany({ where: { user_id: { in: [603, 604] } } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: [603, 604] } } })
  await prisma.employees.deleteMany({ where: { id: { in: [603, 604] } } })
  invalidateNotificationPrefsCache(603)
  invalidateNotificationPrefsCache(604)
}

async function seedEmployee(id, email, role) {
  await prisma.employees.deleteMany({ where: { id } })
  return prisma.employees.create({
    data: { id, name: `Prefs ${id}`, email, password_hash: PASSWORD_HASH, role, is_active: true },
  })
}

beforeAll(async () => {
  await seedEmployee(603, ADMIN_EMAIL, 'admin')
  await seedEmployee(604, FOREIGN_EMAIL, 'agent')
})

afterAll(async () => {
  await cleanup()
})

describe('unit: defaultPrefs / normalizePrefs / mergePrefs', () => {
  it('defaultPrefs — все события × все каналы включены', () => {
    const prefs = defaultPrefs()
    for (const ev of NOTIF_EVENTS) {
      for (const ch of NOTIF_CHANNELS) expect(prefs[ev][ch]).toBe(true)
    }
  })

  it('normalizePrefs — невалидные payload отклоняются', () => {
    expect(normalizePrefs(null).valid).toBe(false)
    expect(normalizePrefs('str').valid).toBe(false)
    expect(normalizePrefs({ ticket_message: { email: 'yes' } }).valid).toBe(false)
    expect(normalizePrefs({ ticket_message: 'x' }).valid).toBe(false)
    expect(normalizePrefs({ unknown_event: { email: false } }).valid).toBe(true)
  })

  it('normalizePrefs — частичный объект сливается с дефолтами', () => {
    const { valid, prefs } = normalizePrefs({ ticket_message: { email: false } })
    expect(valid).toBe(true)
    expect(prefs.ticket_message.email).toBe(false)
    expect(prefs.ticket_message.push).toBe(true)
    expect(prefs.ticket_created.email).toBe(true)
  })

  it('mergePrefs — хранимое строкой JSON/null сливается корректно', () => {
    const merged = mergePrefs(JSON.parse('{"ticket_status":{"email":false}}'))
    expect(merged.ticket_status.email).toBe(false)
    expect(merged.ticket_status.in_app).toBe(true)
    expect(mergePrefs(null).ticket_created.email).toBe(true)
    expect(mergePrefs('bad').ticket_created.push).toBe(true)
  })
})

describe('GET /api/notifications/preferences', () => {
  it('401 без токена', async () => {
    await request(app).get('/api/notifications/preferences').expect(401)
  })

  it('дефолты для пользователя без сохранённых настроек', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.events).toEqual(NOTIF_EVENTS)
    expect(res.body.data.channels).toEqual(NOTIF_CHANNELS)
    for (const ev of NOTIF_EVENTS) {
      for (const ch of NOTIF_CHANNELS) expect(res.body.data.prefs[ev][ch]).toBe(true)
    }
  })
})

describe('PUT /api/notifications/preferences', () => {
  it('401 без токена', async () => {
    await request(app).put('/api/notifications/preferences').send({}).expect(401)
  })

  it('400 на невалидный payload', async () => {
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ticket_message: { email: 'yes' } })
      .expect(400)
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send('nope')
      .expect(400)
  })

  it('сохраняет настройки и отдаёт их в GET (изоляция: другой пользователь видит дефолты)', async () => {
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ticket_message: { email: false, push: true, in_app: false } })
      .expect(200)

    const get = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(get.body.data.prefs.ticket_message.email).toBe(false)
    expect(get.body.data.prefs.ticket_message.in_app).toBe(false)
    expect(get.body.data.prefs.ticket_message.push).toBe(true)
    expect(get.body.data.prefs.ticket_created.email).toBe(true)

    const foreign = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(200)
    expect(foreign.body.data.prefs.ticket_message.email).toBe(true)
  })
})

describe('unit: allowedUserIds (реальная БД)', () => {
  it('фильтрует пользователей по включённому каналу/событию', async () => {
    await prisma.notification_preferences.upsert({
      where: { user_id: 603 },
      update: { prefs: JSON.stringify({ ticket_message: { email: false, push: true, in_app: true } }), updated_at: new Date() },
      create: { user_id: 603, prefs: JSON.stringify({ ticket_message: { email: false, push: true, in_app: true } }) },
    })
    invalidateNotificationPrefsCache(603)

    const email = await allowedUserIds([603, 604], 'ticket_message', 'email')
    expect(email).toEqual([604]) // у 603 email выключен
    const inApp = await allowedUserIds([603, 604], 'ticket_message', 'in_app')
    expect(inApp).toEqual([603, 604]) // 604 — дефолт (включено), 603 — включено
    expect(await allowedUserIds([603], 'ticket_message', 'push')).toEqual([603])
    expect(await allowedUserIds([], 'ticket_message', 'email')).toEqual([])
  })

  it('getPrefsForUser — дефолты для 604, сохранённые для 603', async () => {
    const prefs604 = await getPrefsForUser(604)
    expect(prefs604.ticket_message.email).toBe(true)
    const prefs603 = await getPrefsForUser(603)
    expect(prefs603.ticket_message.email).toBe(false)
  })
})