import { describe, it, expect, vi, beforeEach } from 'vitest'

const cacheMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('../cache.js', () => ({ cache: cacheMock }))

import { idempotent } from '../middleware/idempotency.js'

function makeRes() {
  return { json: vi.fn() }
}

function run(req, res, next) {
  // resolve и на next(), и на res.json(): при Redis-хите зовётся только json.
  // Возвращаем исходный спай json — res.json будет заменён обёртками.
  const jsonSpy = res.json
  return new Promise((resolve) => {
    res.json = (...args) => { jsonSpy(...args); resolve() }
    idempotent(req, res, (...args) => { next(...args); resolve() })
  }).then(() => jsonSpy)
}

describe('idempotent — idempotency key вне Redis (in-memory fallback)', () => {
  beforeEach(() => {
    cacheMock.get.mockReset()
    cacheMock.set.mockReset()
  })

  it('без ключа — просто next(), json не трогаем', () => {
    const res = makeRes()
    const next = vi.fn()
    idempotent({ headers: {}, user: { userId: 1 } }, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.json).not.toHaveBeenCalled()
  })

  it('кэш из Redis — возвращаем его, next() не зовём', async () => {
    cacheMock.get.mockResolvedValue({ id: 1 })
    const res = makeRes()
    const next = vi.fn()
    const jsonSpy = await run({ headers: { 'idempotency-key': 'k1' }, user: { userId: 1 } }, res, next)
    expect(jsonSpy).toHaveBeenCalledWith({ id: 1 })
    expect(next).not.toHaveBeenCalled()
    expect(cacheMock.set).not.toHaveBeenCalled()
  })

  it('Redis упал — первый запрос пишет в in-memory, повторный отдаёт его же', async () => {
    cacheMock.get.mockRejectedValue(new Error('redis down'))
    // первый запрос: ответ пошёл в обработчик, результат сохранён в памяти
    const res1 = makeRes()
    const next1 = vi.fn()
    const jsonSpy1 = await run({ headers: { 'idempotency-key': 'k2' }, user: { userId: 1 } }, res1, next1)
    expect(next1).toHaveBeenCalledTimes(1)
    res1.json({ id: 2 })
    expect(cacheMock.set).not.toHaveBeenCalled()
    expect(jsonSpy1).toHaveBeenCalledWith({ id: 2 })
    // повторный запрос: отдаёт сохранённый ответ без повторного запуска
    const res2 = makeRes()
    const next2 = vi.fn()
    const jsonSpy2 = await run({ headers: { 'idempotency-key': 'k2' }, user: { userId: 1 } }, res2, next2)
    expect(jsonSpy2).toHaveBeenCalledWith({ id: 2 })
    expect(next2).not.toHaveBeenCalled()
  })

  it('тот же ключ, другой payload — 409 не отдаётся, возвращается первый ответ (by design)', async () => {
    cacheMock.get.mockRejectedValue(new Error('redis down'))
    // первый запрос с payload A
    const res1 = makeRes()
    const next1 = vi.fn()
    await run({ headers: { 'idempotency-key': 'k-collide' }, user: { userId: 1 } }, res1, next1)
    expect(next1).toHaveBeenCalledTimes(1)
    res1.json({ id: 'A' })
    // повторный запрос с другим payload B — middleware не должен отдавать 409,
    // а вернуть сохранённый первый ответ (идемпотентность по ключу)
    const res2 = makeRes()
    const next2 = vi.fn()
    const jsonSpy2 = await run({ headers: { 'idempotency-key': 'k-collide' }, user: { userId: 1 } }, res2, next2)
    expect(jsonSpy2).toHaveBeenCalledWith({ id: 'A' })
    expect(next2).not.toHaveBeenCalled()
  })

  it('пишет результат и в Redis, и в память при живом Redis', async () => {
    cacheMock.get.mockResolvedValue(null)
    cacheMock.set.mockResolvedValue(true)
    const res = makeRes()
    const next = vi.fn()
    await run({ headers: { 'idempotency-key': 'k4' }, user: { userId: 1 } }, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    res.json({ ok: true })
    expect(cacheMock.set).toHaveBeenCalledWith(expect.stringContaining(':1:k4'), { ok: true }, expect.any(Number))
  })

  it('ключ скоупится по userId', () => {
    cacheMock.get.mockResolvedValue(null)
    idempotent({ headers: { 'idempotency-key': 'k3' }, user: { userId: 9 } }, makeRes(), vi.fn())
    expect(cacheMock.get).toHaveBeenCalledWith(expect.stringContaining(':9:k3'))
  })
})