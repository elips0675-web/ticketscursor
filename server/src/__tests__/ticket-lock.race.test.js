import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// Агенты из seed: 3 = «Дмитрий Сидоров», 4 = «Елена Козлова» (видят неназначенные тикеты).
const agentAToken = jwt.sign({ userId: 3, role: 'agent', name: 'Дмитрий Сидоров' }, JWT_SECRET, { expiresIn: '1h' })
const agentBToken = jwt.sign({ userId: 4, role: 'agent', name: 'Елена Козлова' }, JWT_SECRET, { expiresIn: '1h' })

let ticket

beforeAll(async () => {
  ticket = await prisma.tickets.create({
    data: {
      title: 'Race: параллельный захват блокировки',
      description: 'Два агента одновременно лочат тикет',
      status: 'open',
      priority: 'medium',
      category: 'support',
      created_by: 500,
      assigned_to: null,
    },
  })
})

afterAll(async () => {
  if (ticket) {
    await prisma.tickets.updateMany({ where: { id: ticket.id }, data: { locked_by: null, locked_at: null } })
    await prisma.tickets.deleteMany({ where: { id: ticket.id } })
  }
})

describe('Race: POST /:id/lock — атомарный захват', () => {
  it('два параллельных lock → ровно один 200, второй 423', async () => {
    const [resA, resB] = await Promise.all([
      request(app).post(`/api/tickets/${ticket.id}/lock`).set('Authorization', `Bearer ${agentAToken}`),
      request(app).post(`/api/tickets/${ticket.id}/lock`).set('Authorization', `Bearer ${agentBToken}`),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 423])

    const db = await prisma.tickets.findUnique({ where: { id: ticket.id }, select: { locked_by: true } })
    // Владелец блокировки — ровно один из двух агентов
    expect([3, 4]).toContain(db.locked_by)
  })

  it('владелец может повторно лочить свой тикет (re-entrant → 200)', async () => {
    // Закрепляем текущего владельца из БД
    const db = await prisma.tickets.findUnique({ where: { id: ticket.id }, select: { locked_by: true } })
    const ownerToken = db.locked_by === 3 ? agentAToken : agentBToken
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/lock`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(res.status).toBe(200)
  })
})