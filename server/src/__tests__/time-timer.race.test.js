import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// super_admin из seed: 1 = «Алексей Петров» (timer-роуты через requireRole требуют admin+).
const agentToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })

let ticket

beforeAll(async () => {
  ticket = await prisma.tickets.create({
    data: {
      title: 'Race: параллельный старт таймера',
      description: 'Два параллельных POST timer/start от одного агента',
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
    await prisma.ticket_timers.deleteMany({ where: { ticket_id: ticket.id } })
    await prisma.tickets.deleteMany({ where: { id: ticket.id } })
  }
})

describe('Race: POST /:id/time/timer/start — один активный таймер', () => {
  it('два параллельных старта → оба 201, в БД ровно один таймер', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/tickets/${ticket.id}/time/timer/start`)
        .set('Authorization', `Bearer ${agentToken}`),
      request(app)
        .post(`/api/tickets/${ticket.id}/time/timer/start`)
        .set('Authorization', `Bearer ${agentToken}`),
    ])

    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)

    const timers = await prisma.ticket_timers.findMany({
      where: { ticket_id: ticket.id, user_id: 1 },
    })
    expect(timers).toHaveLength(1)
  })

  it('stop останавливает единственный таймер → 200', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/time/timer/stop`)
      .set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const timers = await prisma.ticket_timers.findMany({
      where: { ticket_id: ticket.id, user_id: 1 },
    })
    expect(timers).toHaveLength(0)
  })
})