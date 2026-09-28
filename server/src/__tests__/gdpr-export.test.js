// Этап 66 (подфича 1): GDPR-экспорт — GET /api/gdpr/export.
// Флаг gdpr_export: off → 404, on → полный JSON данных пользователя (только свои данные).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

let flagEnabled = true

vi.mock('../feature-flags.js', () => ({
  isFeatureEnabled: vi.fn(async () => flagEnabled),
  invalidateFeatureFlagCache: vi.fn(),
}))

vi.mock('../prisma.js', () => ({
  default: {
    employees: { findUnique: vi.fn() },
    tickets: { findMany: vi.fn() },
    ticket_messages: { findMany: vi.fn() },
    chat_messages: { findMany: vi.fn() },
    files: { findMany: vi.fn() },
    wiki_articles: { findMany: vi.fn() },
    polls: { findMany: vi.fn() },
    poll_votes: { findMany: vi.fn() },
    notifications: { findMany: vi.fn() },
    audit_log: { findMany: vi.fn() },
  },
}))

vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('../middleware.js', () => {
  const JWT_SECRET = 'test-secret-key-12345'
  return {
    JWT_SECRET,
    authenticateToken: (req, res, next) => {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' })
      }
      try {
        req.user = require('jsonwebtoken').verify(authHeader.split(' ')[1], JWT_SECRET)
        return next()
      } catch {
        return res.status(403).json({ message: 'Invalid token' })
      }
    },
    requireRole: () => (req, res, next) => next(),
  }
})

import prisma from '../prisma.js'
import { JWT_SECRET } from '../middleware.js'
import gdprRouter from '../routes/gdpr.js'

const USER = jwt.sign({ userId: 606, name: 'GDPR User', role: 'agent' }, JWT_SECRET)

let app

beforeEach(() => {
  vi.clearAllMocks()
  flagEnabled = true
  app = express()
  app.use(express.json())
  app.use('/gdpr', gdprRouter)
})

function mockResolvedData() {
  prisma.employees.findUnique.mockResolvedValue({ id: 606, name: 'GDPR User', email: 'gdpr@test.com', role: 'agent' })
  prisma.tickets.findMany.mockResolvedValue([])
  prisma.ticket_messages.findMany.mockResolvedValue([])
  prisma.chat_messages.findMany.mockResolvedValue([])
  prisma.files.findMany.mockResolvedValue([])
  prisma.wiki_articles.findMany.mockResolvedValue([])
  prisma.polls.findMany.mockResolvedValue([])
  prisma.poll_votes.findMany.mockResolvedValue([])
  prisma.notifications.findMany.mockResolvedValue([{ id: 1, type: 'ticket_status', title: 'Status', is_read: false, body: 'abc' }])
  prisma.audit_log.findMany.mockResolvedValue([])
}

describe('GDPR export (Этап 66, подфича 1)', () => {
  it('требует авторизацию: без токена → 401', async () => {
    const res = await request(app).get('/gdpr/export')
    expect(res.status).toBe(401)
  })

  it('флаг gdpr_export = off → 404 (фича не включена)', async () => {
    flagEnabled = false
    const res = await request(app).get('/gdpr/export').set('Authorization', `Bearer ${USER}`)
    expect(res.status).toBe(404)
    expect(prisma.employees.findUnique).not.toHaveBeenCalled()
  })

  it('флаг on → полный JSON своих данных + Content-Disposition', async () => {
    mockResolvedData()
    const res = await request(app).get('/gdpr/export').set('Authorization', `Bearer ${USER}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('gdpr-export-user-606.json')
    const body = res.body
    expect(body.success).toBe(true)
    expect(body.data.user.email).toBe('gdpr@test.com')
    expect(body.data.tickets_created).toEqual([])
    expect(body.data.notifications).toHaveLength(1)
    expect(body.data.exported_at).toBeDefined()
  })

  it('экспорт собирает ТОЛЬКО данные запросившего пользователя (userId из токена)', async () => {
    mockResolvedData()
    prisma.tickets.findMany.mockResolvedValueOnce([{ id: 1, title: 'Мой тикет' }])
    await request(app).get('/gdpr/export').set('Authorization', `Bearer ${USER}`)
    expect(prisma.tickets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ created_by: 606 }) }),
    )
    expect(prisma.tickets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assigned_to: 606 }) }),
    )
  })

  it('ошибка БД → 500', async () => {
    prisma.employees.findUnique.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/gdpr/export').set('Authorization', `Bearer ${USER}`)
    expect(res.status).toBe(500)
  })
})