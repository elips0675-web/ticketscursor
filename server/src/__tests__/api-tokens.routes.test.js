// Этап 68: routes/api-tokens.js — покрытие 23.8% → роут-тесты.
// GET / (список), POST / (создание, валидация имени), DELETE /:id (404/403/200/500).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

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
    requireRole: () => (_req, _res, next) => next(),
  }
})

vi.mock('../services/api-tokens.service.js', () => ({
  createToken: vi.fn(),
  listTokens: vi.fn(),
  deleteToken: vi.fn(),
}))

import { JWT_SECRET } from '../middleware.js'
import { createToken, listTokens, deleteToken } from '../services/api-tokens.service.js'
import tokensRouter from '../routes/api-tokens.js'

const TOKEN = jwt.sign({ userId: 42, role: 'admin' }, JWT_SECRET)

let app

beforeEach(() => {
  vi.clearAllMocks()
  app = express()
  app.use(express.json())
  app.use('/api/tokens', tokensRouter)
})

describe('api-tokens routes (Этап 68)', () => {
  it('401 без токена', async () => {
    const res = await request(app).get('/api/tokens')
    expect(res.status).toBe(401)
  })

  describe('GET /', () => {
    it('200 со списком токенов текущего пользователя', async () => {
      listTokens.mockResolvedValue([{ id: 1, name: 'CI', prefix: 'sd_abc' }])
      const res = await request(app).get('/api/tokens').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual([{ id: 1, name: 'CI', prefix: 'sd_abc' }])
      expect(listTokens).toHaveBeenCalledWith(42)
    })

    it('500 при ошибке сервиса', async () => {
      listTokens.mockRejectedValue(new Error('db down'))
      const res = await request(app).get('/api/tokens').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /', () => {
    it('400 без имени токена', async () => {
      const res = await request(app)
        .post('/api/tokens')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ name: '   ' })
      expect(res.status).toBe(400)
      expect(createToken).not.toHaveBeenCalled()
    })

    it('201 создаёт токен и показывает его один раз', async () => {
      const expires = '2027-01-01T00:00:00.000Z'
      createToken.mockResolvedValue({
        id: 9,
        name: 'CI Token',
        prefix: 'sd_abc',
        raw: 'sd_abc' + 'x'.repeat(64),
        scopes: ['tickets:read'],
        expires_at: expires,
        created_at: '2026-07-01T00:00:00.000Z',
      })
      const res = await request(app)
        .post('/api/tokens')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ name: '  CI Token  ', scopes: 'tickets:read', expires_at: expires })
      expect(res.status).toBe(201)
      expect(res.body.data.token).toContain('sd_abc')
      expect(res.body.message).toContain('not be shown again')
      expect(createToken).toHaveBeenCalledWith(42, 'CI Token', 'tickets:read', expires)
    })

    it('500 при ошибке сервиса', async () => {
      createToken.mockRejectedValue(new Error('boom'))
      const res = await request(app)
        .post('/api/tokens')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ name: 'CI' })
      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /:id', () => {
    it('404, если токен не найден', async () => {
      deleteToken.mockResolvedValue(null)
      const res = await request(app).delete('/api/tokens/1').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(404)
      expect(deleteToken).toHaveBeenCalledWith(1, 42)
    })

    it('403 для чужого токена', async () => {
      deleteToken.mockResolvedValue('forbidden')
      const res = await request(app).delete('/api/tokens/2').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(403)
    })

    it('200 при успешном удалении', async () => {
      deleteToken.mockResolvedValue(true)
      const res = await request(app).delete('/api/tokens/3').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('500 при ошибке сервиса', async () => {
      deleteToken.mockRejectedValue(new Error('boom'))
      const res = await request(app).delete('/api/tokens/4').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(500)
    })
  })
})