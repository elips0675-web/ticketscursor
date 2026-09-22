import { describe, it, expect, vi, beforeEach } from 'vitest'

const webhooksServiceMock = {
  listWebhooks: vi.fn().mockResolvedValue([{ id: 1, name: 'Hook 1' }]),
  createWebhook: vi.fn().mockResolvedValue({ id: 1, name: 'New Hook' }),
  updateWebhook: vi.fn().mockResolvedValue({ id: 1, name: 'Updated' }),
  deleteWebhook: vi.fn().mockResolvedValue(true),
  AVAILABLE_EVENTS: ['ticket_created', 'ticket_updated'],
}

vi.mock('../middleware.js', () => ({
  authenticateToken: (req, _res, next) => { req.user = { userId: 1, role: 'admin' }; next() },
  requireRole: () => (_req, _res, next) => next(),
}))
vi.mock('../services/webhooks.service.js', () => webhooksServiceMock)

describe('webhooks route', () => {
  let router

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/webhooks.js')
    router = mod.default
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

  describe('GET /events', () => {
    it('returns available events', async () => {
      const handler = findHandler('get', '/events')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: webhooksServiceMock.AVAILABLE_EVENTS })
    })
  })

  describe('GET /', () => {
    it('lists webhooks', async () => {
      const handler = findHandler('get', '/')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(webhooksServiceMock.listWebhooks).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 500 on service error', async () => {
      webhooksServiceMock.listWebhooks.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('POST /', () => {
    it('creates a webhook', async () => {
      const handler = findHandler('post', '/')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ body: { name: 'New Hook', url: 'https://example.com/hook', events: ['ticket_created'] } })
      await handler(req, res)
      expect(webhooksServiceMock.createWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Hook', url: 'https://example.com/hook', createdBy: 1 }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when name is missing', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { url: 'https://example.com', events: ['ticket_created'] } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when url is missing', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { name: 'Hook', events: ['ticket_created'] } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when events empty', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { name: 'Hook', url: 'https://example.com', events: [] } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 500 on service error', async () => {
      webhooksServiceMock.createWebhook.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { name: 'Hook', url: 'https://example.com', events: ['ticket_created'] } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('PUT /:id', () => {
    it('updates a webhook', async () => {
      const handler = findHandler('put', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { name: 'Updated' } })
      await handler(req, res)
      expect(webhooksServiceMock.updateWebhook).toHaveBeenCalledWith(1, { name: 'Updated' })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 404 when webhook not found', async () => {
      webhooksServiceMock.updateWebhook.mockResolvedValueOnce(null)
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' }, body: { name: 'X' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      webhooksServiceMock.updateWebhook.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { name: 'X' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('DELETE /:id', () => {
    it('deletes a webhook', async () => {
      const handler = findHandler('delete', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(webhooksServiceMock.deleteWebhook).toHaveBeenCalledWith(1)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 404 when webhook not found', async () => {
      webhooksServiceMock.deleteWebhook.mockResolvedValueOnce(false)
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      webhooksServiceMock.deleteWebhook.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})