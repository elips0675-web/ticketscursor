import { describe, it, expect, afterEach, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// Предохранители (Этап 61): клампинг limit в list-эндпоинтах и запрет N+1
// в списке тикетов (спай на prisma.tickets.findMany — один запрос на список, не на строку).

const adminToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })

afterEach(() => {
  vi.restoreAllMocks()
})

function getWithAuth(path) {
  return request(app).get(path).set('Authorization', `Bearer ${adminToken}`)
}

describe('Клампинг limit (предохранитель лимитов)', () => {
  it('limit=9999 -> take=500 (верхняя граница)', async () => {
    const spy = vi.spyOn(prisma.tickets, 'findMany')
    const res = await getWithAuth('/api/tickets?limit=9999')
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0][0].take).toBe(500)
  })

  it('limit=0 -> дефолт 50 (0 трактуется как «не задан»)', async () => {
    const spy = vi.spyOn(prisma.tickets, 'findMany')
    const res = await getWithAuth('/api/tickets?limit=0')
    expect(res.status).toBe(200)
    expect(spy.mock.calls[0][0].take).toBe(50)
  })

  it('limit=-5 -> take=1 (отрицательные значения клампятся)', async () => {
    const spy = vi.spyOn(prisma.tickets, 'findMany')
    const res = await getWithAuth('/api/tickets?limit=-5')
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0][0].take).toBe(1)
  })

  it('limit=abc -> take=50 (дефолт при нечисловом значении)', async () => {
    const spy = vi.spyOn(prisma.tickets, 'findMany')
    const res = await getWithAuth('/api/tickets?limit=abc')
    expect(res.status).toBe(200)
    expect(spy.mock.calls[0][0].take).toBe(50)
  })
})

describe('N+1 (предохранитель запросов в цикле)', () => {
  it('GET /api/tickets делает ровно один findMany на список, а не на строку', async () => {
    const spy = vi.spyOn(prisma.tickets, 'findMany')
    const res = await getWithAuth('/api/tickets?limit=100')
    expect(res.status).toBe(200)
    // Если бы был N+1 — вызовов было бы total+1; здесь ровно один запрос списка
    expect(spy.mock.calls.length).toBe(1)
  })
})