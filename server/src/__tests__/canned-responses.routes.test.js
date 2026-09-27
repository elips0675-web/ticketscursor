// Этап 68: routes/canned-responses.js — покрытие 16.7% → роут-тесты.
// GET (список), POST (RBAC + валидация), PUT (RBAC + 404), DELETE (RBAC + 404).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

vi.mock('../prisma.js', () => ({
  default: {
    canned_responses: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
    requireRole: (...roles) => (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      next()
    },
  }
})

import prisma from '../prisma.js'
import { JWT_SECRET } from '../middleware.js'
import cannedRouter from '../routes/canned-responses.js'

const ADMIN = jwt.sign({ userId: 42, role: 'admin' }, JWT_SECRET)
const AGENT = jwt.sign({ userId: 7, role: 'agent' }, JWT_SECRET)

let app

beforeEach(() => {
  vi.clearAllMocks()
  app = express()
  app.use(express.json())
  app.use('/api/canned-responses', cannedRouter)
})

describe('canned-responses routes (Этап 68)', () => {
  it('401 без токена', async () => {
    const res = await request(app).get('/api/canned-responses')
    expect(res.status).toBe(401)
  })

  describe('GET /', () => {
    it('200 со списком, отсортированным по category/title', async () => {
      prisma.canned_responses.findMany.mockResolvedValue([{ id: 1, title: 'Приветствие', category: 'greetings' }])
      const res = await request(app).get('/api/canned-responses').set('Authorization', `Bearer ${ADMIN}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data[0].title).toBe('Приветствие')
      expect(prisma.canned_responses.findMany).toHaveBeenCalledWith({
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
      })
    })

    it('500 при ошибке', async () => {
      prisma.canned_responses.findMany.mockRejectedValue(new Error('db down'))
      const res = await request(app).get('/api/canned-responses').set('Authorization', `Bearer ${ADMIN}`)
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /', () => {
    it('403 для агента', async () => {
      const res = await request(app)
        .post('/api/canned-responses')
        .set('Authorization', `Bearer ${AGENT}`)
        .send({ title: 'X', text: 'Y' })
      expect(res.status).toBe(403)
      expect(prisma.canned_responses.create).not.toHaveBeenCalled()
    })

    it('400 без title/text', async () => {
      const res = await request(app)
        .post('/api/canned-responses')
        .set('Authorization', `Bearer ${ADMIN}`)
        .send({ title: 'X' })
      expect(res.status).toBe(400)
      expect(res.body.message).toContain('required')
    })

    it('201 создаёт ответ с created_by из токена', async () => {
      prisma.canned_responses.create.mockResolvedValue({ id: 1, title: 'Привет', category: '' })
      const res = await request(app)
        .post('/api/canned-responses')
        .set('Authorization', `Bearer ${ADMIN}`)
        .send({ title: 'Привет', text: 'Здравствуйте!', category: 'greetings' })
      expect(res.status).toBe(201)
      expect(prisma.canned_responses.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ title: 'Привет', text: 'Здравствуйте!', category: 'greetings', created_by: 42 }),
      })
    })

    it('500 при ошибке', async () => {
      prisma.canned_responses.create.mockRejectedValue(new Error('boom'))
      const res = await request(app)
        .post('/api/canned-responses')
        .set('Authorization', `Bearer ${ADMIN}`)
        .send({ title: 'X', text: 'Y' })
      expect(res.status).toBe(500)
    })
  })

  describe('PUT /:id', () => {
    it('404 для несуществующего ответа', async () => {
      prisma.canned_responses.findUnique.mockResolvedValue(null)
      const res = await request(app)
        .put('/api/canned-responses/99')
        .set('Authorization', `Bearer ${ADMIN}`)
        .send({ title: 'X' })
      expect(res.status).toBe(404)
    })

    it('200 обновляет только переданные поля', async () => {
      prisma.canned_responses.findUnique.mockResolvedValue({ id: 1, title: 'Старое' })
      prisma.canned_responses.update.mockResolvedValue({ id: 1, title: 'Новое', category: 'support' })
      const res = await request(app)
        .put('/api/canned-responses/1')
        .set('Authorization', `Bearer ${ADMIN}`)
        .send({ title: 'Новое' })
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe('Новое')
      expect(prisma.canned_responses.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ title: 'Новое', updated_at: expect.any(Date) }),
      })
    })

    it('403 для агента', async () => {
      const res = await request(app)
        .put('/api/canned-responses/1')
        .set('Authorization', `Bearer ${AGENT}`)
        .send({ title: 'X' })
      expect(res.status).toBe(403)
    })

    it('500 при ошибке', async () => {
      prisma.canned_responses.findUnique.mockResolvedValue({ id: 1 })
      prisma.canned_responses.update.mockRejectedValue(new Error('boom'))
      const res = await request(app)
        .put('/api/canned-responses/1')
        .set('Authorization', `Bearer ${ADMIN}`)
        .send({ title: 'X' })
      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /:id', () => {
    it('404 для несуществующего ответа', async () => {
      prisma.canned_responses.findUnique.mockResolvedValue(null)
      const res = await request(app).delete('/api/canned-responses/99').set('Authorization', `Bearer ${ADMIN}`)
      expect(res.status).toBe(404)
    })

    it('200 удаляет ответ', async () => {
      prisma.canned_responses.findUnique.mockResolvedValue({ id: 1 })
      const res = await request(app).delete('/api/canned-responses/1').set('Authorization', `Bearer ${ADMIN}`)
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ deleted: true })
      expect(prisma.canned_responses.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('403 для агента', async () => {
      const res = await request(app).delete('/api/canned-responses/1').set('Authorization', `Bearer ${AGENT}`)
      expect(res.status).toBe(403)
    })

    it('500 при ошибке', async () => {
      prisma.canned_responses.findUnique.mockResolvedValue({ id: 1 })
      prisma.canned_responses.delete.mockRejectedValue(new Error('boom'))
      const res = await request(app).delete('/api/canned-responses/1').set('Authorization', `Bearer ${ADMIN}`)
      expect(res.status).toBe(500)
    })
  })
})