import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateCache } from '../cache.js'

// Этап 62 — GET /api/tickets/:id/history: timeline изменений тикета из audit_log.
// Два нюанса среды, которые делают «наивные» ассерты флакими:
//  1. logAudit в роутах — fire-and-forget (не авается): события дописываются в БД асинхронно;
//  2. /tickets смонтирован с cacheMiddleware(120) — ответы GET кэшируются на 120с и
//     «замораживают» первый (неполный) ответ.
// Поэтому каждый запрос истории сбрасывает кэш /api/tickets* и опрашивает до сходимости.
const adminToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })
const requester500Token = jwt.sign({ userId: 500, role: 'requester', name: 'Пётр Петров' }, JWT_SECRET, { expiresIn: '1h' })
const requester501Token = jwt.sign({ userId: 501, role: 'requester', name: 'Иван Иванов' }, JWT_SECRET, { expiresIn: '1h' })

const createdIds = []
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

afterAll(async () => {
  if (createdIds.length) {
    await prisma.audit_log.deleteMany({ where: { entity_type: 'ticket', entity_id: { in: createdIds } } })
    await prisma.tickets.deleteMany({ where: { id: { in: createdIds } } })
  }
})

async function createTicket(token, title) {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, description: 'Описание для таймлайна', priority: 'medium', category: 'support' })
  expect(res.status).toBe(201)
  createdIds.push(res.body.data.id)
  return res.body.data.id
}

async function fetchHistory(token, ticketId) {
  await invalidateCache('cache:*:/api/tickets*')
  const res = await request(app).get(`/api/tickets/${ticketId}/history`).set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
  return res.body.data
}

async function waitForHistoryCount(token, ticketId, min, timeout = 10000) {
  const deadline = Date.now() + timeout
  let events = []
  while (Date.now() < deadline) {
    events = await fetchHistory(token, ticketId)
    if (events.length >= min) return events
    await delay(100)
  }
  return events
}

describe('GET /api/tickets/:id/history — timeline тикета', () => {
  it('возвращает события (created/status/priority/assign) с распарсенными details, по убыванию', async () => {
    const ticketId = await createTicket(adminToken, 'Timeline: полный путь')

    await request(app)
      .put(`/api/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_progress' })
      .expect(200)
    await request(app)
      .put(`/api/tickets/${ticketId}/priority`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'high' })
      .expect(200)
    await request(app)
      .put(`/api/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: null })
      .expect(200)

    const events = await waitForHistoryCount(adminToken, ticketId, 4)
    expect(events.length).toBeGreaterThanOrEqual(4)

    const actions = events.map((e) => e.action)
    expect(actions).toContain('created')
    expect(actions).toContain('status_changed')
    expect(actions).toContain('priority_changed')
    expect(actions).toContain('assigned')

    // Сортировка: created_at desc, при равных таймстемпах — id desc (вторичный ключ).
    // Порядок вставки событий не гарантирован (logAudit fire-and-forget), поэтому
    // проверяем только монотонность id/created_at, а не конкретную последовательность действий.
    const first4 = events.slice(0, 4)
    const ids = first4.map((e) => e.id)
    expect([...ids].sort((a, b) => b - a)).toEqual(ids)

    const statusEvent = events.find((e) => e.action === 'status_changed')
    expect(statusEvent.details).toEqual({ from: 'open', to: 'in_progress' })
    const priorityEvent = events.find((e) => e.action === 'priority_changed')
    expect(priorityEvent.details).toEqual({ from: 'medium', to: 'high' })
    const createdEvent = events.find((e) => e.action === 'created')
    expect(createdEvent.user_name).toBe('Алексей Петров')
    expect(createdEvent.details.title).toBe('Timeline: полный путь')
  })

  it('RBAC: создатель видит историю, чужой requester — 403', async () => {
    const ticketId = await createTicket(requester500Token, 'Timeline: RBAC')

    const own = await request(app)
      .get(`/api/tickets/${ticketId}/history`)
      .set('Authorization', `Bearer ${requester500Token}`)
    expect(own.status).toBe(200)

    const foreign = await request(app)
      .get(`/api/tickets/${ticketId}/history`)
      .set('Authorization', `Bearer ${requester501Token}`)
    expect(foreign.status).toBe(403)
  })

  it('пустая история, если событий нет (audit_log вычищен)', async () => {
    const ticketId = await createTicket(adminToken, 'Timeline: без событий')
    // дождаться фоновой записи created-события, затем чистить до сходимости к []
    await waitForHistoryCount(adminToken, ticketId, 1)
    let events = []
    for (let i = 0; i < 20; i++) {
      await prisma.audit_log.deleteMany({ where: { entity_type: 'ticket', entity_id: ticketId } })
      events = await fetchHistory(adminToken, ticketId)
      if (events.length === 0) break
      await delay(100)
    }
    expect(events).toEqual([])
  })

  it('404 для несуществующего тикета', async () => {
    const res = await request(app)
      .get('/api/tickets/99999999/history')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('400 для невалидного id', async () => {
    const res = await request(app)
      .get('/api/tickets/abc/history')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
  })
})