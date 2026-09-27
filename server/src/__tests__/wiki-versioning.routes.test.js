// Этап 65 (подзадача 1): версионирование Wiki — PUT /wiki/:id, GET /:id/revisions,
// GET /:id/revisions/:revId, POST /:id/rollback/:revId (RBAC + ревизии-снимки).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

vi.mock('../prisma.js', () => ({
  default: {
    wiki_articles: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    wiki_revisions: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('../audit.js', () => ({
  auditLogMiddleware: (req, res, next) => next(),
  logAudit: vi.fn(),
}))

vi.mock('../middleware.js', () => {
  const JWT_SECRET = 'test-secret-key-12345'
  const ROLE_HIERARCHY = ['requester', 'agent', 'senior_agent', 'admin', 'super_admin']
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
      if (!req.user) return res.status(403).json({ message: 'Forbidden' })
      const userLevel = ROLE_HIERARCHY.indexOf(req.user.role)
      const requiredLevel = Math.max(...roles.map((r) => ROLE_HIERARCHY.indexOf(r)))
      if (userLevel < requiredLevel || userLevel === -1) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      next()
    },
  }
})

import prisma from '../prisma.js'
import { JWT_SECRET } from '../middleware.js'
import wikiRouter from '../routes/wiki.js'

const ADMIN = jwt.sign({ userId: 42, name: 'Admin', role: 'admin' }, JWT_SECRET)
const AGENT = jwt.sign({ userId: 7, name: 'Agent', role: 'agent' }, JWT_SECRET)

let app

beforeEach(() => {
  vi.clearAllMocks()
  app = express()
  app.use(express.json())
  app.use('/api/wiki', wikiRouter)
})

const REV_2 = {
  id: 2, article_id: 1, revision: 2, title: 'VPN v2', content: 'Инструкция обновлена',
  category: 'Инструкции', tags: ['vpn'], author_id: 42, author_name: 'Admin', created_at: new Date().toISOString(),
}

describe('PUT /api/wiki/:id (Этап 65)', () => {
  it('200: обновляет статью и создаёт снимок-ревизию №2', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 1, title: 'VPN v2', content: 'Инструкция обновлена', category: 'Инструкции', tags: ['vpn'], author_id: 42, author_name: 'Admin' })
    prisma.wiki_revisions.findFirst.mockResolvedValue({ revision: 1 })
    prisma.wiki_revisions.create.mockResolvedValue(REV_2)

    const res = await request(app)
      .put('/api/wiki/1')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ title: 'VPN v2', content: 'Инструкция обновлена', category: 'Инструкции', tags: ['vpn'] })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.title).toBe('VPN v2')
    expect(prisma.wiki_articles.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ title: 'VPN v2', content: 'Инструкция обновлена', updated_at: expect.any(Date) }),
    })
    expect(prisma.wiki_revisions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ article_id: 1, revision: 2, author_name: 'Admin' }) }),
    )
  })

  it('403: agent не может редактировать статью', async () => {
    const res = await request(app)
      .put('/api/wiki/1')
      .set('Authorization', `Bearer ${AGENT}`)
      .send({ title: 'X', content: 'Y' })
    expect(res.status).toBe(403)
    expect(prisma.wiki_articles.update).not.toHaveBeenCalled()
  })

  it('400: пустой title — валидация createWikiSchema', async () => {
    const res = await request(app)
      .put('/api/wiki/1')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ title: '   ', content: 'Y' })
    expect(res.status).toBe(400)
  })

  it('500 при ошибке БД', async () => {
    prisma.wiki_articles.update.mockRejectedValue(new Error('db down'))
    const res = await request(app)
      .put('/api/wiki/1')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ title: 'VPN v2', content: 'Инструкция обновлена' })
    expect(res.status).toBe(500)
  })
})

describe('GET /api/wiki/:id/revisions', () => {
  it('200: список ревизий (последняя первой)', async () => {
    prisma.wiki_revisions.findMany.mockResolvedValue([REV_2, { ...REV_2, id: 1, revision: 1 }])
    const res = await request(app).get('/api/wiki/1/revisions').set('Authorization', `Bearer ${ADMIN}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)
    expect(prisma.wiki_revisions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { article_id: 1 }, orderBy: { revision: 'desc' } }),
    )
  })

  it('500 при ошибке БД', async () => {
    prisma.wiki_revisions.findMany.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/api/wiki/1/revisions').set('Authorization', `Bearer ${ADMIN}`)
    expect(res.status).toBe(500)
  })
})

describe('GET /api/wiki/:id/revisions/:revId', () => {
  it('200: конкретная ревизия', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue(REV_2)
    const res = await request(app).get('/api/wiki/1/revisions/2').set('Authorization', `Bearer ${ADMIN}`)
    expect(res.status).toBe(200)
    expect(res.body.data.revision).toBe(2)
    expect(prisma.wiki_revisions.findFirst).toHaveBeenCalledWith({ where: { id: 2, article_id: 1 } })
  })

  it('404: ревизия не принадлежит статье / не существует', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue(null)
    const res = await request(app).get('/api/wiki/1/revisions/999').set('Authorization', `Bearer ${ADMIN}`)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/wiki/:id/rollback/:revId', () => {
  it('200: откат к ревизии — статья обновлена + создан новый снимок', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue(REV_2)
    prisma.wiki_articles.update.mockResolvedValue({ id: 1, title: 'VPN v2', content: 'Инструкция обновлена', category: 'Инструкции', tags: ['vpn'], author_id: 1, author_name: 'Admin' })
    prisma.wiki_revisions.findFirst.mockResolvedValue(REV_2)
    // для getNextRevision внутри rollback берём последнюю ревизию из самого REV_2
    prisma.wiki_revisions.findFirst.mockResolvedValueOnce(REV_2) // поиск целевой ревизии
    prisma.wiki_revisions.findFirst.mockResolvedValueOnce({ revision: 2 }) // следующий номер → 3
    prisma.wiki_revisions.create.mockResolvedValue({ ...REV_2, id: 3, revision: 3 })

    const res = await request(app)
      .post('/api/wiki/1/rollback/2')
      .set('Authorization', `Bearer ${ADMIN}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.title).toBe('VPN v2')
    // новая ревизия-снимок отката
    expect(prisma.wiki_revisions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ article_id: 1, revision: 3, title: 'VPN v2' }) }),
    )
  })

  it('404: ревизия не найдена', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/wiki/1/rollback/999')
      .set('Authorization', `Bearer ${ADMIN}`)
    expect(res.status).toBe(404)
    expect(prisma.wiki_articles.update).not.toHaveBeenCalled()
  })

  it('403: agent не может откатывать', async () => {
    const res = await request(app).post('/api/wiki/1/rollback/2').set('Authorization', `Bearer ${AGENT}`)
    expect(res.status).toBe(403)
  })
})