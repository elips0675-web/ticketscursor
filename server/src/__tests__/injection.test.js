// Этап 68: SQL-injection защита.
// Проверяем, что пользовательский ввод никогда не попадает в SQL-строку:
// 1) search-роут параметризует q через $queryRaw-плейсхолдеры (prisma экранирует);
// 2) fallback на LIKE тоже параметризован;
// 3) $queryRawUnsafe в admin-ops используется только со статичными строками.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

vi.mock('../prisma.js', () => {
  const queryRaw = vi.fn(() => [])
  const queryRawUnsafe = vi.fn(() => [])
  return { default: { $queryRaw: queryRaw, $queryRawUnsafe: queryRawUnsafe } }
})

vi.mock('../search-sync.js', () => ({
  searchMeilisearch: vi.fn().mockResolvedValue(null),
}))

vi.mock('../logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('../settings.js', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
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
        const jwtModule = require('jsonwebtoken')
        req.user = jwtModule.verify(authHeader.split(' ')[1], JWT_SECRET)
        return next()
      } catch {
        return res.status(403).json({ message: 'Invalid token' })
      }
    },
    requireRole: () => (_req, _res, next) => next(),
  }
})

import prisma from '../prisma.js'
import { searchMeilisearch } from '../search-sync.js'
import { JWT_SECRET } from '../middleware.js'
import searchRouter from '../routes/search.js'
import * as adminOps from '../services/admin-ops.js'

// Классические SQL-injection payload'ы
const MALICIOUS_QUERIES = [
  "' OR 1=1 --",
  "'; DROP TABLE tickets;--",
  'x" UNION SELECT email, password_hash FROM employees --',
  '1; DELETE FROM ticket_messages;--',
  "\\'; DROP TABLE users;--",
  '%',
  '*',
  'a'.repeat(300),
]

const INJECTION_RE = /OR\s+1=1|DROP\s+TABLE|UNION\s+SELECT|DELETE\s+FROM|;\s*--/i

let app
let token

function sqlText(strings) {
  return Array.isArray(strings) ? strings.join('?') : String(strings)
}

function expectParameterized(calls, expectedValue) {
  expect(calls.length).toBeGreaterThan(0)
  let foundAsParameter = false
  for (const [strings, ...values] of calls) {
    expect(sqlText(strings)).not.toMatch(INJECTION_RE)
    if (expectedValue !== undefined && values.some((v) => String(v) === expectedValue)) {
      foundAsParameter = true
    }
  }
  return foundAsParameter
}

beforeEach(() => {
  vi.resetAllMocks()
  searchMeilisearch.mockResolvedValue(null)
  prisma.$queryRaw.mockResolvedValue([])
  app = express()
  app.use(express.json())
  app.use('/api/search', searchRouter)
  token = jwt.sign({ userId: 1, role: 'super_admin' }, JWT_SECRET)
})

describe('injection.test.js — SQL-injection защита (Этап 68)', () => {
  describe('поиск: payload не попадает в SQL-шаблон', () => {
    it.each(MALICIOUS_QUERIES)('q=%j — 200, SQL параметризован', async (q) => {
      const res = await request(app).get('/api/search').query({ q }).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const calls = prisma.$queryRaw.mock.calls
      if (calls.length === 0) {
        // payload короче 2 символов отсечён валидацией до SQL — это тоже защита
        expect(res.body.data.tickets).toEqual([])
        return
      }
      // payload уходит только как параметр ($queryRaw ${q}), а не внутрь текста запроса
      const found = expectParameterized(calls, `${q}*`)
      expect(found).toBe(true)
      expect(calls.some(([strings]) => sqlText(strings).includes(q.slice(0, 8)))).toBe(false)
    })

    it('короткий опасный payload без звёздочки-суффикса тоже параметризуется', async () => {
      const q = "' OR 1=1 --"
      await request(app).get('/api/search').query({ q }).set('Authorization', `Bearer ${token}`)
      const calls = prisma.$queryRaw.mock.calls
      expect(expectParameterized(calls, `${q}*`)).toBe(true)
    })
  })

  describe('fallback на LIKE тоже параметризован', () => {
    it('после падения FULLTEXT LIKE получает параметр %q%, а не конкатенацию', async () => {
      prisma.$queryRaw
        .mockRejectedValueOnce(new Error('FULLTEXT index not found'))
        .mockResolvedValue([])

      const q = "x' OR 1=1 UNION SELECT * FROM tickets --"
      const res = await request(app).get('/api/search').query({ q }).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      const calls = prisma.$queryRaw.mock.calls
      const likeCalls = calls.filter(([strings]) => sqlText(strings).includes('LIKE'))
      expect(likeCalls.length).toBeGreaterThan(0)
      let found = false
      for (const [strings, ...values] of likeCalls) {
        expect(sqlText(strings)).not.toMatch(INJECTION_RE)
        if (values.some((v) => String(v) === `%${q}%`)) found = true
      }
      expect(found).toBe(true)
    })
  })

  describe('оба пути падают — 500, а не выполнение инъекции', () => {
    it('FULLTEXT и LIKE упали → 500', async () => {
      prisma.$queryRaw
        .mockRejectedValueOnce(new Error('FULLTEXT failed'))
        .mockRejectedValueOnce(new Error('LIKE failed'))

      const res = await request(app).get('/api/search').query({ q: "'; DROP TABLE tickets;--" }).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(500)
    })
  })

  describe('валдиация входа: пустой/короткий q не доходит до SQL', () => {
    it('длина < 2 → пустая выдача, $queryRaw не вызывается', async () => {
      const res = await request(app).get('/api/search').query({ q: "'" }).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.data.tickets).toEqual([])
      expect(prisma.$queryRaw).not.toHaveBeenCalled()
    })
  })

  describe('$queryRawUnsafe в admin-ops — только статичные строки', () => {
    it('checkDatabase использует ровно SELECT 1', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ '1': 1 }])
      const result = await adminOps.checkDatabase()
      expect(result.ok).toBe(true)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1')
    })

    it('getMigrations использует статичный SQL без интерполяции', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ name: '001_init.js', batch: 1, migration_time: new Date() }])
      const result = await adminOps.getMigrations()
      expect(result.appliedCount).toBe(1)
      const calls = prisma.$queryRawUnsafe.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      for (const [sql] of calls) {
        expect(typeof sql).toBe('string')
        // Никаких плейсхолдеров и явных признаков интерполяции пользовательских данных
        expect(sql).not.toMatch(/\$\{/)
        expect(sql).not.toMatch(INJECTION_RE)
      }
    })

    it('checkDatabase при ошибке возвращает ok:false без проброса', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('connection refused'))
      const result = await adminOps.checkDatabase()
      expect(result.ok).toBe(false)
      expect(result.message).toContain('connection refused')
    })
  })
})