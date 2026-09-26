import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateCache } from '../cache.js'

// Этап 64 (подфича 2) — Ticket relations (флаг ticket_relations):
//  - GET /api/tickets/:id/relations — список связей, включая обратные (direction in/out);
//  - POST /api/tickets/:id/relations { relatedTicketId, type } — создать (201; self → 400; дубль → 409);
//  - DELETE /api/tickets/:id/relations/:relationId — удалить;
//  - изоляция: выделенные id 608 (admin) / 609 (agent).
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy'

const adminToken = jwt.sign({ userId: 608, role: 'admin', name: 'Relations Admin' }, JWT_SECRET, { expiresIn: '1h' })
const agentToken = jwt.sign({ userId: 609, role: 'agent', name: 'Relations Agent' }, JWT_SECRET, { expiresIn: '1h' })

const createdIds = []
const createdRelationIds = []

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
    .send({ title, description: 'Описание для relations', priority: 'medium', category: 'support' })
  expect(res.status).toBe(201)
  createdIds.push(res.body.data.id)
  return res.body.data.id
}

function clearTicketsCache() {
  return invalidateCache('cache:*:/api/tickets*')
}

beforeAll(async () => {
  await seedEmployee(608, 'relations-admin@example.com', 'admin', 'Relations Admin')
  await seedEmployee(609, 'relations-agent@example.com', 'agent', 'Relations Agent')
})

afterAll(async () => {
  if (createdRelationIds.length) {
    await prisma.ticket_relations.deleteMany({ where: { id: { in: createdRelationIds } } })
  }
  if (createdIds.length) {
    await prisma.audit_log.deleteMany({ where: { entity_type: 'ticket', entity_id: { in: createdIds } } })
    await prisma.tickets.deleteMany({ where: { id: { in: createdIds } } })
  }
  await prisma.audit_log.deleteMany({ where: { user_id: { in: [608, 609] } } })
  await prisma.notifications.deleteMany({ where: { user_id: { in: [608, 609] } } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: [608, 609] } } })
  await prisma.employees.deleteMany({ where: { id: { in: [608, 609] } } })
})

describe('GET /api/tickets/:id/relations', () => {
  it('401 без токена', async () => {
    await request(app).get('/api/tickets/1/relations').expect(401)
  })

  it('пустой список для нового тикета', async () => {
    const ticketId = await createTicket(adminToken, 'Relations: пустой список')
    await clearTicketsCache()
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual([])
  })

  it('возвращает связи с other_ticket (обе стороны)', async () => {
    const a = await createTicket(adminToken, 'Relations: A')
    const b = await createTicket(adminToken, 'Relations: B')
    const addRes = await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'related' })
      .expect(201)
    createdRelationIds.push(addRes.body.data.id)

    await clearTicketsCache()
    const fromA = await request(app)
      .get(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(fromA.body.data).toHaveLength(1)
    expect(fromA.body.data[0].direction).toBe('out')
    expect(fromA.body.data[0].other_ticket.id).toBe(b)
    expect(fromA.body.data[0].type).toBe('related')

    // Обратная сторона тоже видит связь (direction in)
    const fromB = await request(app)
      .get(`/api/tickets/${b}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(fromB.body.data).toHaveLength(1)
    expect(fromB.body.data[0].direction).toBe('in')
    expect(fromB.body.data[0].other_ticket.id).toBe(a)
  })
})

describe('POST /api/tickets/:id/relations', () => {
  it('создаёт связь (201) и возвращает id + other_ticket', async () => {
    const a = await createTicket(adminToken, 'Relations: create A')
    const b = await createTicket(adminToken, 'Relations: create B')
    const res = await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'parent' })
      .expect(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.other_ticket.id).toBe(b)
    createdRelationIds.push(res.body.data.id)
  })

  it('нельзя связать тикет с самим собой', async () => {
    const a = await createTicket(adminToken, 'Relations: self')
    await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: a, type: 'related' })
      .expect(400)
  })

  it('дубликат связи → 409', async () => {
    const a = await createTicket(adminToken, 'Relations: dup A')
    const b = await createTicket(adminToken, 'Relations: dup B')
    const first = await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'related' })
      .expect(201)
    createdRelationIds.push(first.body.data.id)
    const second = await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'related' })
      .expect(409)
    expect(second.body.relationId).toBe(first.body.data.id)
  })

  it('404 для несуществующего related-тикета', async () => {
    const a = await createTicket(adminToken, 'Relations: no related')
    await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: 999999, type: 'related' })
      .expect(404)
  })

  it('400 при невалидном типе связи', async () => {
    const a = await createTicket(adminToken, 'Relations: bad type')
    const b = await createTicket(adminToken, 'Relations: bad type B')
    await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'alien' })
      .expect(400)
  })
})

describe('DELETE /api/tickets/:id/relations/:relationId', () => {
  it('удаляет связь', async () => {
    const a = await createTicket(adminToken, 'Relations: delete A')
    const b = await createTicket(adminToken, 'Relations: delete B')
    const addRes = await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'related' })
      .expect(201)
    const relationId = addRes.body.data.id
    await request(app)
      .delete(`/api/tickets/${a}/relations/${relationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    await clearTicketsCache()
    const listRes = await request(app)
      .get(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(listRes.body.data).toEqual([])
  })

  it('403 при удалении чужой связи', async () => {
    const a = await createTicket(adminToken, 'Relations: foreign A')
    const b = await createTicket(adminToken, 'Relations: foreign B')
    const addRes = await request(app)
      .post(`/api/tickets/${a}/relations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ relatedTicketId: b, type: 'related' })
      .expect(201)
    const relationId = addRes.body.data.id
    // Назначаем тикет A на админа — тогда agent 609 теряет доступ (не создатель/исполнитель)
    await request(app)
      .put(`/api/tickets/${a}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 608 })
      .expect(200)
    await request(app)
      .delete(`/api/tickets/${a}/relations/${relationId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403)
    createdRelationIds.push(relationId)
  })

  it('404 для несуществующей связи', async () => {
    const a = await createTicket(adminToken, 'Relations: no relation')
    await request(app)
      .delete(`/api/tickets/${a}/relations/999999`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)
  })
})