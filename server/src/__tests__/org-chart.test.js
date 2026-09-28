// Этап 66 (подфича 2): Org chart — GET /api/team/org-chart.
// Флаг org_chart: off → 404, on → дерево сотрудников (только активные, с manager_id).
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
    employees: { findMany: vi.fn() },
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
import teamRouter from '../routes/team.js'

const USER = jwt.sign({ userId: 607, name: 'Team User', role: 'agent' }, JWT_SECRET)

let app

beforeEach(() => {
  vi.clearAllMocks()
  flagEnabled = true
  app = express()
  app.use(express.json())
  app.use('/team', teamRouter)
})

describe('Org chart (Этап 66, подфича 2)', () => {
  it('требует авторизацию: без токена → 401', async () => {
    const res = await request(app).get('/team/org-chart')
    expect(res.status).toBe(401)
  })

  it('флаг org_chart = off → 404 (фича не включена)', async () => {
    flagEnabled = false
    const res = await request(app).get('/team/org-chart').set('Authorization', `Bearer ${USER}`)
    expect(res.status).toBe(404)
    expect(prisma.employees.findMany).not.toHaveBeenCalled()
  })

  it('флаг on → список активных сотрудников с manager_id', async () => {
    prisma.employees.findMany.mockResolvedValue([
      { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', department: 'IT', title: '', avatar: '', online: true, manager_id: null },
      { id: 2, name: 'Иван', email: 'ivan@test.com', role: 'agent', department: 'Support', title: '', avatar: '', online: true, manager_id: 1 },
    ])
    const res = await request(app).get('/team/org-chart').set('Authorization', `Bearer ${USER}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[1].manager_id).toBe(1)
    // Только активные, без чувствительных полей (password_hash не запрашивается)
    expect(prisma.employees.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } }),
    )
  })

  it('ошибка БД → 500', async () => {
    prisma.employees.findMany.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/team/org-chart').set('Authorization', `Bearer ${USER}`)
    expect(res.status).toBe(500)
  })
})