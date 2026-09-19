import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = {
  push_subscriptions: {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
}

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../audit.js', () => ({ auditLogMiddleware: (_req, _res, next) => next() }))
vi.mock('../middleware.js', () => ({
  authenticateToken: (req, _res, next) => { req.user = { userId: 1, role: 'admin' }; next() },
  requireRole: () => (_req, _res, next) => next(),
}))

const mockSendNotification = vi.fn().mockResolvedValue({})
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockSendNotification,
  },
}))

describe('push route', () => {
  let router

  beforeEach(async () => {
    vi.resetModules()
    process.env.VAPID_PUBLIC_KEY = 'test-public-key'
    process.env.VAPID_PRIVATE_KEY = 'test-private-key'
    const mod = await import('../routes/push.js')
    router = mod.default
    mockSendNotification.mockClear()
  })

  function mockReqRes(overrides = {}) {
    const req = {
      user: { userId: 1, role: 'admin' },
      params: {},
      query: {},
      body: {},
      ...overrides,
    }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    return { req, res }
  }

  function findHandler(method, path) {
    const stack = router.stack
    for (const layer of stack) {
      if (layer.route && layer.route.path === path && layer.route.methods[method]) {
        return layer.route.stack[layer.route.stack.length - 1].handle
      }
    }
    return null
  }

  describe('GET /vapid-key', () => {
    it('returns VAPID public key', async () => {
      const handler = findHandler('get', '/vapid-key')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { publicKey: 'test-public-key' },
      }))
    })

    it('returns 500 when VAPID not configured', async () => {
      delete process.env.VAPID_PUBLIC_KEY
      vi.resetModules()
      const mod = await import('../routes/push.js')
      const stack = mod.default.stack
      for (const layer of stack) {
        if (layer.route && layer.route.path === '/vapid-key' && layer.route.methods.get) {
          const { req, res } = mockReqRes()
          await layer.route.stack[layer.route.stack.length - 1].handle(req, res)
          expect(res.status).toHaveBeenCalledWith(500)
          break
        }
      }
    })
  })

  describe('GET /subscription', () => {
    it('returns user subscriptions', async () => {
      prismaMock.push_subscriptions.findMany.mockResolvedValue([
        { subscription_json: '{"endpoint":"https://example.com","keys":{"auth":"abc","p256dh":"def"}}' },
      ])
      const handler = findHandler('get', '/subscription')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: [expect.objectContaining({ endpoint: 'https://example.com' })],
      }))
    })
  })

  describe('POST /subscribe', () => {
    it('creates subscription', async () => {
      const handler = findHandler('post', '/subscribe')
      const sub = { endpoint: 'https://fcm.googleapis.com/test', keys: { auth: 'x', p256dh: 'y' } }
      const { req, res } = mockReqRes({ body: { subscription_json: sub } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when subscription_json is missing', async () => {
      const handler = findHandler('post', '/subscribe')
      const { req, res } = mockReqRes({ body: {} })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('DELETE /unsubscribe', () => {
    it('removes user subscriptions', async () => {
      const handler = findHandler('delete', '/unsubscribe')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })
  })

  describe('POST /send', () => {
    it('sends push to all subscribers', async () => {
      prismaMock.push_subscriptions.findMany.mockResolvedValue([
        { user_id: 1, subscription_json: '{"endpoint":"https://example.com","keys":{"auth":"x","p256dh":"y"}}' },
      ])
      mockSendNotification.mockResolvedValue({})
      const handler = findHandler('post', '/send')
      const { req, res } = mockReqRes({ body: { title: 'Test', body: 'Hello', url: '/tickets/1' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ sent: 1, total: 1 }),
      }))
    })

    it('returns 400 when title is missing', async () => {
      const handler = findHandler('post', '/send')
      const { req, res } = mockReqRes({ body: {} })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns sent:0 when no subscribers', async () => {
      prismaMock.push_subscriptions.findMany.mockResolvedValue([])
      const handler = findHandler('post', '/send')
      const { req, res } = mockReqRes({ body: { title: 'Test' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ sent: 0, total: 0 })
    })

    it('cleans up expired subscriptions (410)', async () => {
      prismaMock.push_subscriptions.findMany.mockResolvedValue([
        { user_id: 2, subscription_json: '{"endpoint":"https://expired.com","keys":{}}' },
      ])
      mockSendNotification.mockRejectedValue({ statusCode: 410 })
      const handler = findHandler('post', '/send')
      const { req, res } = mockReqRes({ body: { title: 'Test' } })
      await handler(req, res)
      expect(prismaMock.push_subscriptions.deleteMany).toHaveBeenCalledWith({ where: { user_id: 2 } })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sent: 0, failed: 1 }),
      }))
    })
  })
})
