import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// Пользователи из seed: 3 = агент «Дмитрий Сидоров», 4 = агент «Елена Козлова».
// Requester'ы не существуют в БД — клеймим произвольные userId (created_by без FK в миграции).
const requesterAToken = jwt.sign({ userId: 500, role: 'requester', name: 'Requester A' }, JWT_SECRET, { expiresIn: '1h' })
const requesterBToken = jwt.sign({ userId: 501, role: 'requester', name: 'Requester B' }, JWT_SECRET, { expiresIn: '1h' })
const agentDmitryToken = jwt.sign({ userId: 3, role: 'agent', name: 'Дмитрий Сидоров' }, JWT_SECRET, { expiresIn: '1h' })
const agentElenaToken = jwt.sign({ userId: 4, role: 'agent', name: 'Елена Козлова' }, JWT_SECRET, { expiresIn: '1h' })

let ticketA // создан requester A, неназначен
let ticketAssigned // создан requester A, назначен агенту 3

beforeAll(async () => {
  ticketA = await prisma.tickets.create({
    data: {
      title: 'IDOR: тикет requester A',
      description: 'Приватные данные requester A',
      status: 'open',
      priority: 'medium',
      category: 'support',
      created_by: 500,
      assigned_to: null,
    },
  })
  ticketAssigned = await prisma.tickets.create({
    data: {
      title: 'IDOR: тикет, назначенный агенту 3',
      description: 'Чужой назначенный тикет',
      status: 'open',
      priority: 'high',
      category: 'incident',
      created_by: 500,
      assigned_to: 3,
    },
  })
})

afterAll(async () => {
  if (ticketAssigned) await prisma.tickets.deleteMany({ where: { id: ticketAssigned.id } })
  if (ticketA) await prisma.tickets.deleteMany({ where: { id: ticketA.id } })
})

describe('IDOR — requester видит только свои тикеты', () => {
  it('requester B не может прочитать чужой тикет (GET /:id → 403)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketA.id}`)
      .set('Authorization', `Bearer ${requesterBToken}`)
    expect(res.status).toBe(403)
    expect(res.body.message).toBe('Forbidden')
  })

  it('requester A читает свой тикет (GET /:id → 200)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketA.id}`)
      .set('Authorization', `Bearer ${requesterAToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(ticketA.id)
  })

  it('requester B не читает переписку чужого тикета (GET /:id/messages → 403)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketA.id}/messages`)
      .set('Authorization', `Bearer ${requesterBToken}`)
    expect(res.status).toBe(403)
  })

  it('requester B не лочит чужой тикет (POST /:id/lock → 403)', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketA.id}/lock`)
      .set('Authorization', `Bearer ${requesterBToken}`)
    expect(res.status).toBe(403)
  })

  it('requester B не смотрит lock-статус чужого тикета (GET /:id/lock → 403)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketA.id}/lock`)
      .set('Authorization', `Bearer ${requesterBToken}`)
    expect(res.status).toBe(403)
  })
})

describe('IDOR — agent видит свои + неназначенные', () => {
  it('агент видит неназначенный тикет (GET /:id → 200)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketA.id}`)
      .set('Authorization', `Bearer ${agentDmitryToken}`)
    expect(res.status).toBe(200)
  })

  it('агент не видит тикет, назначенный другому агенту (GET /:id → 403)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketAssigned.id}`)
      .set('Authorization', `Bearer ${agentElenaToken}`)
    expect(res.status).toBe(403)
  })

  it('агент-исполнитель читает свой назначенный тикет (GET /:id → 200)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketAssigned.id}`)
      .set('Authorization', `Bearer ${agentDmitryToken}`)
    expect(res.status).toBe(200)
  })

  it('агент не лочит тикет, назначенный другому агенту (POST /:id/lock → 403)', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketAssigned.id}/lock`)
      .set('Authorization', `Bearer ${agentElenaToken}`)
    expect(res.status).toBe(403)
  })
})

describe('IDOR — senior_agent+ имеет полный доступ', () => {
  it('senior_agent читает чужой неназначенный тикет (GET /:id → 200)', async () => {
    const seniorToken = jwt.sign({ userId: 2, role: 'senior_agent', name: 'Мария Иванова' }, JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .get(`/api/tickets/${ticketA.id}`)
      .set('Authorization', `Bearer ${seniorToken}`)
    expect(res.status).toBe(200)
  })

  it('senior_agent лочит чужой тикет (POST /:id/lock → 200)', async () => {
    const seniorToken = jwt.sign({ userId: 2, role: 'senior_agent', name: 'Мария Иванова' }, JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post(`/api/tickets/${ticketA.id}/lock`)
      .set('Authorization', `Bearer ${seniorToken}`)
    expect(res.status).toBe(200)
    // разблокируем, чтобы не мешать другим тестам
    await request(app)
      .delete(`/api/tickets/${ticketA.id}/lock`)
      .set('Authorization', `Bearer ${seniorToken}`)
  })
})