import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// Пользователь из seed: 1 = super_admin «Алексей Петров» (уровень admin+ для DELETE).
const adminToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })
// created_by без FK (как в idor.test.js).
const requesterToken = jwt.sign({ userId: 500, role: 'requester', name: 'Requester' }, JWT_SECRET, { expiresIn: '1h' })

let ticket

beforeAll(async () => {
  ticket = await prisma.tickets.create({
    data: {
      title: 'Soft-delete: целостность удаления',
      description: 'Тикет для проверки soft-delete',
      status: 'open',
      priority: 'medium',
      category: 'support',
      created_by: 500,
      assigned_to: null,
    },
  })
})

afterAll(async () => {
  if (ticket) await prisma.tickets.deleteMany({ where: { id: ticket.id } })
})

describe('Soft-delete — тикет нельзя «вернуть» через API', () => {
  it('DELETE /:id → 200, alreadyDeleted: false', async () => {
    const res = await request(app)
      .delete(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.alreadyDeleted).toBe(false)
  })

  it('GET /:id после удаления → 404 (скрыт)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('GET /:id/messages после удаления → 404 (скрыт)', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticket.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('удалённый тикет отсутствует в списке GET / (deleted_at фильтруется)', async () => {
    const res = await request(app)
      .get('/api/tickets?limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.some(t => t.id === ticket.id)).toBe(false)
  })

  it('повторный DELETE /:id → 200, alreadyDeleted: true', async () => {
    const res = await request(app)
      .delete(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.alreadyDeleted).toBe(true)
  })

  it('DELETE несуществующего тикета → 404', async () => {
    const res = await request(app)
      .delete('/api/tickets/999999')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('requester не может удалить тикет (403, RBAC)', async () => {
    const res = await request(app)
      .delete(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${requesterToken}`)
    expect(res.status).toBe(403)
  })
})