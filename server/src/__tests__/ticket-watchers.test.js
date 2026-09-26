import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateCache } from '../cache.js'

// Этап 64 (подфича 1) — Watchers / Subscribers тикета (флаг ticket_watchers):
//  - GET /api/tickets/:id/watchers — список подписчиков;
//  - POST /api/tickets/:id/watchers { employeeId } — подписать сотрудника (201; повторная — alreadyWatching);
//  - DELETE /api/tickets/:id/watchers/:employeeId — отписать (свой id — любой, чужой — только senior_agent+);
//  - 401/403/404 и изоляция: выделенные id 605 (admin) / 606 (agent-watcher) / 607 (чужой agent).
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')

const adminToken = jwt.sign({ userId: 605, role: 'admin', name: 'Watchers Admin' }, JWT_SECRET, { expiresIn: '1h' })
const watcherToken = jwt.sign({ userId: 606, role: 'agent', name: 'Watcher User' }, JWT_SECRET, { expiresIn: '1h' })
const foreignToken = jwt.sign({ userId: 607, role: 'agent', name: 'Foreign Agent' }, JWT_SECRET, { expiresIn: '1h' })

const createdIds = []

// Чистим зависимые записи до пересоздания сотрудника (P2003: FK user_id от
// остатков прошлых прогонов / автоинкрементных пользователей других тестов).
async function cleanupEmployeeDeps(id) {
  await prisma.notifications.deleteMany({ where: { user_id: id } })
  await prisma.audit_log.deleteMany({ where: { user_id: id } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: id } })
  await prisma.notification_preferences.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.user_totp.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.push_subscriptions.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.ticket_watchers.deleteMany({ where: { employee_id: id } }).catch(() => {})
  await prisma.ticket_timers.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.time_entries.deleteMany({ where: { user_id: id } }).catch(() => {})
}

async function seedEmployee(id, email, role, name) {
  await cleanupEmployeeDeps(id)
  await prisma.employees.deleteMany({ where: { id } })
  await prisma.employees.create({ data: { id, name, email, password_hash: PASSWORD_HASH, role, is_active: true } })
}

async function createTicket(token, title) {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, description: 'Описание для watchers', priority: 'medium', category: 'support' })
  expect(res.status).toBe(201)
  createdIds.push(res.body.data.id)
  return res.body.data.id
}

function clearTicketsCache() {
  return invalidateCache('cache:*:/api/tickets*')
}

beforeAll(async () => {
  await seedEmployee(605, 'watchers-admin@example.com', 'admin', 'Watchers Admin')
  await seedEmployee(606, 'watchers-user@example.com', 'agent', 'Watcher User')
  await seedEmployee(607, 'watchers-foreign@example.com', 'agent', 'Foreign Agent')
})

afterAll(async () => {
  if (createdIds.length) {
    await prisma.ticket_watchers.deleteMany({ where: { ticket_id: { in: createdIds } } })
    await prisma.audit_log.deleteMany({ where: { entity_type: 'ticket', entity_id: { in: createdIds } } })
    await prisma.tickets.deleteMany({ where: { id: { in: createdIds } } })
  }
  await prisma.audit_log.deleteMany({ where: { user_id: { in: [605, 606, 607] } } })
  await prisma.notifications.deleteMany({ where: { user_id: { in: [605, 606, 607] } } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: [605, 606, 607] } } })
  await prisma.employees.deleteMany({ where: { id: { in: [605, 606, 607] } } })
})

describe('GET /api/tickets/:id/watchers', () => {
  it('401 без токена', async () => {
    await request(app).get('/api/tickets/1/watchers').expect(401)
  })

  it('пустой список watchers для нового тикета', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: пустой список')
    await clearTicketsCache()
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual([])
  })

  it('404 для несуществующего тикета', async () => {
    await request(app).get('/api/tickets/999999/watchers').set('Authorization', `Bearer ${adminToken}`).expect(404)
  })

  it('403 для сотрудника без доступа к тикету', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: чужой доступ')
    // Назначаем тикет на 606 — тогда 607 (agent) теряет доступ (не создатель/исполнитель)
    await request(app)
      .put(`/api/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(200)
    await request(app).get(`/api/tickets/${ticketId}/watchers`).set('Authorization', `Bearer ${foreignToken}`).expect(403)
  })
})

describe('POST /api/tickets/:id/watchers', () => {
  it('добавляет watcher и возвращает его в списке', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: добавить')
    const addRes = await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(201)
    expect(addRes.body.success).toBe(true)
    expect(addRes.body.data.id).toBe(606)

    await clearTicketsCache()
    const listRes = await request(app)
      .get(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(listRes.body.data).toHaveLength(1)
    expect(listRes.body.data[0].id).toBe(606)
  })

  it('повторная подписка — 200 alreadyWatching, дубликатов нет', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: повтор')
    await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(201)
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(200)
    expect(res.body.alreadyWatching).toBe(true)

    await clearTicketsCache()
    const listRes = await request(app)
      .get(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(listRes.body.data).toHaveLength(1)
  })

  it('404 для несуществующего сотрудника', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: нет сотрудника')
    await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 999999 })
      .expect(404)
  })

  it('400 при невалидном теле (employeeId не число)', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: валидация')
    await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 'abc' })
      .expect(400)
  })

  it('403 для сотрудника без доступа', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: чужой POST')
    await request(app)
      .put(`/api/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(200)
    await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ employeeId: 606 })
      .expect(403)
  })
})

describe('DELETE /api/tickets/:id/watchers/:employeeId', () => {
  it('watcher может отписать себя', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: самоотписка')
    await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(201)
    const res = await request(app)
      .delete(`/api/tickets/${ticketId}/watchers/606`)
      .set('Authorization', `Bearer ${watcherToken}`)
      .expect(200)
    expect(res.body.success).toBe(true)

    await clearTicketsCache()
    const listRes = await request(app)
      .get(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(listRes.body.data).toEqual([])
  })

  it('agent не может снять чужого watcher', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: чужой DELETE')
    await request(app)
      .post(`/api/tickets/${ticketId}/watchers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 606 })
      .expect(201)
    await request(app)
      .delete(`/api/tickets/${ticketId}/watchers/606`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(403)
  })

  it('404 когда watcher не подписан', async () => {
    const ticketId = await createTicket(adminToken, 'Watchers: нет подписки')
    await request(app)
      .delete(`/api/tickets/${ticketId}/watchers/606`)
      .set('Authorization', `Bearer ${watcherToken}`)
      .expect(404)
  })
})