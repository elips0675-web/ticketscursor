import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { z } from 'zod'
import { app, server } from '../app.js'

// Contract-тесты (Этап 60): zod-схемы ответов топ-5 list-эндпоинтов.
// Схемы «мягкие» (passthrough) — контракт фиксирует форму конверта и обязательные поля,
// но не привязывается к случайным полям модели.

const elementWithId = z.object({ id: z.number() }).passthrough()
const plainList = z.object({
  success: z.literal(true),
  data: z.array(elementWithId),
})
const pagedList = z.object({
  success: z.literal(true),
  data: z.object({
    data: z.array(elementWithId),
    total: z.number(),
    page: z.number(),
    totalPages: z.number(),
  }),
})
const ticketsList = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.number(), title: z.string() }).passthrough()),
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
})

let token

beforeAll(async () => {
  server.listen(4006)
  const res = await request(app).post('/api/auth/dev-login')
  token = res.body?.data?.token || res.body?.token
})

afterAll(() => {
  server.close()
})

describe('Contract: zod-схемы ответов list-эндпоинтов', () => {
  async function getWithAuth(path) {
    return request(app).get(path).set('Authorization', `Bearer ${token}`)
  }

  it('GET /api/tickets — конверт и элементы', async () => {
    const res = await getWithAuth('/api/tickets')
    expect(res.status).toBe(200)
    const parsed = ticketsList.safeParse(res.body)
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.data.length > 0) {
      expect(parsed.data.data[0].id).toBeTypeOf('number')
      expect(parsed.data.data[0].title).toBeTypeOf('string')
    }
  })

  it('GET /api/employees — конверт и элементы', async () => {
    const res = await getWithAuth('/api/employees')
    expect(res.status).toBe(200)
    const parsed = plainList.safeParse(res.body)
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.data.length > 0) {
      expect(parsed.data.data[0].id).toBeTypeOf('number')
    }
  })

  it('GET /api/chats — конверт и элементы', async () => {
    const res = await getWithAuth('/api/chats')
    expect(res.status).toBe(200)
    const parsed = plainList.safeParse(res.body)
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.data.length > 0) {
      expect(parsed.data.data[0].id).toBeTypeOf('number')
    }
  })

  it('GET /api/wiki — пагинированный конверт { data, total, page, totalPages }', async () => {
    const res = await getWithAuth('/api/wiki')
    expect(res.status).toBe(200)
    const parsed = pagedList.safeParse(res.body)
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.data.data.length > 0) {
      expect(parsed.data.data.data[0].id).toBeTypeOf('number')
    }
  })

  it('GET /api/news — пагинированный конверт { data, total, page, totalPages }', async () => {
    const res = await getWithAuth('/api/news')
    expect(res.status).toBe(200)
    const parsed = pagedList.safeParse(res.body)
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.data.data.length > 0) {
      expect(parsed.data.data.data[0].id).toBeTypeOf('number')
    }
  })
})