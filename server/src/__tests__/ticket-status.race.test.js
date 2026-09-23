import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// super_admin из seed: 1 = «Алексей Петров» (requireRole('admin','senior_agent') требует admin+).
const seniorToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })

let ticket

beforeAll(async () => {
  ticket = await prisma.tickets.create({
    data: {
      title: 'Race: параллельная смена статуса',
      description: 'Два параллельных PUT status → resolved',
      status: 'in_progress',
      priority: 'medium',
      category: 'support',
      created_by: 500,
      assigned_to: null,
      resolved_at: null,
      first_response_at: new Date(),
    },
  })
})

afterAll(async () => {
  if (ticket) await prisma.tickets.deleteMany({ where: { id: ticket.id } })
})

describe('Race: PUT /:id/status — resolved без двойного resolved_at', () => {
  it('два параллельных resolved → оба 200, resolved_at установлен один раз', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .put(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({ status: 'resolved' }),
      request(app)
        .put(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({ status: 'resolved' }),
    ])

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)

    const db = await prisma.tickets.findUnique({
      where: { id: ticket.id },
      select: { status: true, resolved_at: true },
    })
    expect(db.status).toBe('resolved')
    expect(db.resolved_at).toBeInstanceOf(Date)
  })

  it('два параллельных closed → оба 200, resolved_at остаётся валидным', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .put(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({ status: 'closed' }),
      request(app)
        .put(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${seniorToken}`)
        .send({ status: 'closed' }),
    ])

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)

    const db = await prisma.tickets.findUnique({
      where: { id: ticket.id },
      select: { status: true, resolved_at: true },
    })
    expect(db.status).toBe('closed')
    expect(db.resolved_at).toBeInstanceOf(Date)
  })
})