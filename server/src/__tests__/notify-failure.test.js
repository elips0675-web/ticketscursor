import { describe, it, expect, afterAll, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import * as notify from '../notify.js'

// Регресс-тест (Этап 61): падение email/webhook-уведомлений НЕ должно ломать
// создание тикета — POST /api/tickets обязан вернуть 201 с сохранённым тикетом.
vi.mock('../notify.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    notifyTicketCreated: vi.fn().mockRejectedValue(new Error('SMTP: connection refused')),
    notifyTicketAssigned: vi.fn().mockRejectedValue(new Error('SMTP: connection refused')),
  }
})

const adminToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })

let createdIds = []

afterAll(async () => {
  if (createdIds.length) {
    await prisma.tickets.deleteMany({ where: { id: { in: createdIds } } })
  }
})

describe('Notify-регресс: уведомления упали, тикет всё равно создаётся', () => {
  it('POST /api/tickets при упавших notify → 201, тикет в БД', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Notify-регресс: SMTP отвалился',
        description: 'Тикет должен создаться, даже если рассылка упала',
        priority: 'medium',
        category: 'support',
      })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    const ticketId = res.body.data.id
    expect(typeof ticketId).toBe('number')
    createdIds.push(ticketId)

    // notify вызваны и упали — но это не помешало ответу
    expect(notify.notifyTicketCreated).toHaveBeenCalledWith(ticketId, 'Алексей Петров')

    // Тикет реально сохранён в БД
    const persisted = await prisma.tickets.findUnique({ where: { id: ticketId } })
    expect(persisted).not.toBeNull()
    expect(persisted.title).toBe('Notify-регресс: SMTP отвалился')
    expect(persisted.status).toBe('open')
  })

  it('POST /api/tickets без тела → 400 (валидация не сломалась)', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: '' })
    expect(res.status).toBe(400)
  })
})