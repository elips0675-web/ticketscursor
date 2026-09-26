import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateCache } from '../cache.js'

// Этап 64 (подфича 3) — Merge / Duplicate тикетов (флаг ticket_merge):
//  - POST /api/tickets/:id/duplicate — копия тикета (201, title + « (копия)», status open);
//  - POST /api/tickets/:id/merge { targetTicketId } — перенос сообщений/time-entries из source в target,
//    source → status closed + merged_into=target (200; self → 400; нет target → 404);
//  - RBAC: только admin/senior_agent (agent → 403);
//  - изоляция: выделенные id 610 (admin) / 611 (agent).
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy'

const adminToken = jwt.sign({ userId: 610, role: 'admin', name: 'Merge Admin' }, JWT_SECRET, { expiresIn: '1h' })
const agentToken = jwt.sign({ userId: 611, role: 'agent', name: 'Merge Agent' }, JWT_SECRET, { expiresIn: '1h' })

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
    .send({ title, description: 'Описание для merge', priority: 'medium', category: 'support' })
  expect(res.status).toBe(201)
  createdIds.push(res.body.data.id)
  return res.body.data.id
}

function clearTicketsCache() {
  return invalidateCache('cache:*:/api/tickets*')
}

beforeAll(async () => {
  await seedEmployee(610, 'merge-admin@example.com', 'admin', 'Merge Admin')
  await seedEmployee(611, 'merge-agent@example.com', 'agent', 'Merge Agent')
})

afterAll(async () => {
  if (createdIds.length) {
    await prisma.audit_log.deleteMany({ where: { entity_type: 'ticket', entity_id: { in: createdIds } } })
    await prisma.tickets.deleteMany({ where: { id: { in: createdIds } } })
  }
  await prisma.audit_log.deleteMany({ where: { user_id: { in: [610, 611] } } })
  await prisma.notifications.deleteMany({ where: { user_id: { in: [610, 611] } } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: [610, 611] } } })
  await prisma.employees.deleteMany({ where: { id: { in: [610, 611] } } })
})

describe('POST /api/tickets/:id/duplicate', () => {
  it('создаёт копию тикета (201): title с «(копия)», status open', async () => {
    const source = await createTicket(adminToken, 'Merge: источник копии')
    const res = await request(app)
      .post(`/api/tickets/${source}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
    expect(res.body.success).toBe(true)
    const copyId = res.body.data.id
    createdIds.push(copyId)
    expect(res.body.data.title).toContain('(копия)')

    await clearTicketsCache()
    const copyRes = await request(app)
      .get(`/api/tickets/${copyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(copyRes.body.data.status).toBe('open')
    expect(copyRes.body.data.title).toContain('(копия)')
    expect(copyRes.body.data.created_by).toBe(610)
  }, 15000)

  it('403 для agent (только admin/senior_agent)', async () => {
    const source = await createTicket(adminToken, 'Merge: agent dup')
    await request(app)
      .post(`/api/tickets/${source}/duplicate`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403)
  })

  it('404 для несуществующего тикета', async () => {
    await request(app)
      .post('/api/tickets/999999/duplicate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)
  })
})

describe('POST /api/tickets/:id/merge', () => {
  it('переносит сообщения в target и закрывает source с merged_into', async () => {
    const source = await createTicket(adminToken, 'Merge: source')
    const target = await createTicket(adminToken, 'Merge: target')

    // Добавляем сообщение в source
    const msgRes = await request(app)
      .post(`/api/tickets/${source}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'Сообщение для переноса', isInternal: false })
      .expect(201)
    const msgId = msgRes.body.data?.id || msgRes.body.data?.message?.id

    const res = await request(app)
      .post(`/api/tickets/${source}/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetTicketId: target })
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.targetTicketId).toBe(target)
    expect(res.body.data.movedMessages).toBeGreaterThanOrEqual(1)

    // Source: статус closed + merged_into
    await clearTicketsCache()
    const sourceRes = await request(app)
      .get(`/api/tickets/${source}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(sourceRes.body.data.status).toBe('closed')
    expect(sourceRes.body.data.merged_into).toBe(target)

    // Сообщение теперь принадлежит target
    const targetMsgs = await request(app)
      .get(`/api/tickets/${target}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    const texts = (targetMsgs.body.data || []).map((m) => m.text)
    expect(texts).toContain('Сообщение для переноса')
    if (msgId) {
      const moved = await prisma.ticket_messages.findUnique({ where: { id: msgId } })
      expect(moved.ticket_id).toBe(target)
    }
  }, 15000)

  it('нельзя слить тикет сам в себя', async () => {
    const source = await createTicket(adminToken, 'Merge: self')
    await request(app)
      .post(`/api/tickets/${source}/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetTicketId: source })
      .expect(400)
  })

  it('404 если target не существует', async () => {
    const source = await createTicket(adminToken, 'Merge: no target')
    await request(app)
      .post(`/api/tickets/${source}/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetTicketId: 999999 })
      .expect(404)
  })

  it('403 для agent', async () => {
    const source = await createTicket(adminToken, 'Merge: agent merge')
    const target = await createTicket(adminToken, 'Merge: agent target')
    await request(app)
      .post(`/api/tickets/${source}/merge`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ targetTicketId: target })
      .expect(403)
  })

  it('400 при невалидном теле (targetTicketId отсутствует)', async () => {
    const source = await createTicket(adminToken, 'Merge: bad body')
    await request(app)
      .post(`/api/tickets/${source}/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400)
  })
})