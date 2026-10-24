import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({ $queryRawUnsafe: vi.fn() }))
vi.mock('../prisma.js', () => ({ default: prismaMock }))

const adminOpsMock = vi.hoisted(() => ({ checkRedis: vi.fn() }))
vi.mock('../services/admin-ops.js', () => adminOpsMock)

import { buildReadiness } from '../services/health-ready.js'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.$queryRawUnsafe.mockResolvedValue([{ 1: 1 }])
  adminOpsMock.checkRedis.mockResolvedValue({ name: 'redis', ok: true, configured: true })
})

describe('buildReadiness — CHW-03', () => {
  it('БД и Redis живы → 200 ok, degraded false', async () => {
    const { status, body } = await buildReadiness()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      status: 'ok',
      db: true,
      redis: true,
      queue: { mode: 'bullmq', ok: true },
      degraded: false,
    })
    expect(typeof body.timestamp).toBe('string')
  })

  it('БД жива, Redis не настроен → 200 degraded, очередь in-memory', async () => {
    adminOpsMock.checkRedis.mockResolvedValue({ name: 'redis', ok: false, configured: false })
    const { status, body } = await buildReadiness()
    expect(status).toBe(200)
    expect(body.status).toBe('degraded')
    expect(body.db).toBe(true)
    expect(body.redis).toBe(false)
    expect(body.queue).toEqual({ mode: 'in-memory', ok: true })
    expect(body.degraded).toBe(true)
  })

  it('БД жива, Redis настроен но недоступен → 200 degraded, очередь не ok', async () => {
    adminOpsMock.checkRedis.mockResolvedValue({ name: 'redis', ok: false, configured: true, message: 'connect ECONNREFUSED' })
    const { status, body } = await buildReadiness()
    expect(status).toBe(200)
    expect(body.status).toBe('degraded')
    expect(body.redis).toBe(false)
    expect(body.queue).toEqual({ mode: 'bullmq', ok: false })
    expect(body.degraded).toBe(true)
  })

  it('БД недоступна → 503, degraded true, Redis не проверяется', async () => {
    prismaMock.$queryRawUnsafe.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const { status, body } = await buildReadiness()
    expect(status).toBe(503)
    expect(body).toMatchObject({
      status: 'error',
      db: false,
      redis: false,
      queue: { mode: 'unknown', ok: false },
      degraded: true,
    })
    expect(adminOpsMock.checkRedis).not.toHaveBeenCalled()
  })

  it('checkRedis упал исключением → 200 degraded, а не 500', async () => {
    adminOpsMock.checkRedis.mockRejectedValue(new Error('boom'))
    const { status, body } = await buildReadiness()
    expect(status).toBe(200)
    expect(body.db).toBe(true)
    expect(body.redis).toBe(false)
    expect(body.degraded).toBe(true)
  })

  it('проверка БД идёт через SELECT 1 без интерполяции', async () => {
    await buildReadiness()
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1')
  })
})
