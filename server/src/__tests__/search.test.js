import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../prisma.js', () => {
  const mockFn = vi.fn(() => [])
  const mockPrisma = { $queryRaw: mockFn }
  return { default: mockPrisma }
})

vi.mock('../search-sync.js', () => ({
  searchMeilisearch: vi.fn().mockResolvedValue(null),
}))

vi.mock('../logger.js', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
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
      const token = authHeader.split(' ')[1]
      try {
        const jwt = require('jsonwebtoken')
        const decoded = jwt.verify(token, JWT_SECRET)
        req.user = decoded
        next()
      } catch {
        return res.status(403).json({ message: 'Invalid token' })
      }
    },
    requireRole: (...roles) => (req, res, next) => {
      if (!req.user) return res.status(403).json({ message: 'Forbidden' })
      next()
    },
  }
})

import prisma from '../prisma.js'
import { searchMeilisearch } from '../search-sync.js'
import logger from '../logger.js'
import { JWT_SECRET } from '../middleware.js'
import searchRouter from '../routes/search.js'

import jwt from 'jsonwebtoken'

let app
let token

beforeEach(() => {
  vi.resetAllMocks()
  searchMeilisearch.mockResolvedValue(null)
  prisma.$queryRaw.mockResolvedValue([])
  app = express()
  app.use(express.json())
  app.use('/api/search', searchRouter)
  token = jwt.sign({ userId: 1, role: 'super_admin' }, JWT_SECRET)
})

describe('GET /api/search', () => {
  it('returns empty results for short query', async () => {
    const res = await request(app).get('/api/search?q=a').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tickets).toEqual([])
  })

  it('returns meilisearch results when available', async () => {
    searchMeilisearch.mockResolvedValue({
      tickets: [{ id: 1, title: 'meili result' }],
      employees: [],
      wiki: [],
      news: [],
      chats: [],
      files: [],
    })
    const res = await request(app).get('/api/search?q=test').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tickets[0].title).toBe('meili result')
  })

  it('falls back to LIKE when FULLTEXT fails', async () => {
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('FULLTEXT index not found'))
      .mockResolvedValueOnce([{ id: 1, title: 'like result', status: 'open', priority: 'medium', created_at: new Date().toISOString() }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await request(app).get('/api/search?q=test').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tickets[0].title).toBe('like result')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('returns 500 when both FULLTEXT and LIKE fallback fail', async () => {
    prisma.$queryRaw
      .mockRejectedValueOnce(new Error('FULLTEXT failed'))
      .mockRejectedValueOnce(new Error('LIKE also failed'))

    const res = await request(app).get('/api/search?q=test').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(500)
    expect(logger.error).toHaveBeenCalled()
  })
})
