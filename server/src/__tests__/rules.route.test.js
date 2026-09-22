import { describe, it, expect, vi, beforeEach } from 'vitest'

const rulesServiceMock = {
  listRules: vi.fn().mockResolvedValue([{ id: 1, name: 'Rule 1' }]),
  createRule: vi.fn().mockResolvedValue({ id: 1, name: 'New Rule' }),
  updateRule: vi.fn().mockResolvedValue({ id: 1, name: 'Updated' }),
  deleteRule: vi.fn().mockResolvedValue(true),
  AVAILABLE_TRIGGERS: ['ticket_created', 'ticket_status_changed'],
  AVAILABLE_ACTIONS: ['notify', 'assign'],
}

vi.mock('../middleware.js', () => ({
  authenticateToken: (req, _res, next) => { req.user = { userId: 1, role: 'admin' }; next() },
  requireRole: () => (_req, _res, next) => next(),
}))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../services/rules.service.js', () => rulesServiceMock)

describe('rules route', () => {
  let router

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/rules.js')
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

  describe('GET /triggers', () => {
    it('returns available triggers', async () => {
      const handler = findHandler('get', '/triggers')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: rulesServiceMock.AVAILABLE_TRIGGERS })
    })
  })

  describe('GET /actions', () => {
    it('returns available actions', async () => {
      const handler = findHandler('get', '/actions')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: rulesServiceMock.AVAILABLE_ACTIONS })
    })
  })

  describe('GET /', () => {
    it('lists rules', async () => {
      const handler = findHandler('get', '/')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(rulesServiceMock.listRules).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 500 on service error', async () => {
      rulesServiceMock.listRules.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('POST /', () => {
    it('creates a rule', async () => {
      const handler = findHandler('post', '/')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ body: { name: 'New Rule', trigger_event: 'ticket_created', conditions: [], actions: [] } })
      await handler(req, res)
      expect(rulesServiceMock.createRule).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Rule', triggerEvent: 'ticket_created', createdBy: 1 }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when name is missing', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { trigger_event: 'ticket_created' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when trigger is missing', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { name: 'Rule' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when trigger is invalid', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { name: 'Rule', trigger_event: 'bogus' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 500 on service error', async () => {
      rulesServiceMock.createRule.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { name: 'Rule', trigger_event: 'ticket_created' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('PUT /:id', () => {
    it('updates a rule', async () => {
      const handler = findHandler('put', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { name: 'Updated' } })
      await handler(req, res)
      expect(rulesServiceMock.updateRule).toHaveBeenCalledWith(1, { name: 'Updated' })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when trigger is invalid', async () => {
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { trigger_event: 'bogus' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when rule not found', async () => {
      rulesServiceMock.updateRule.mockResolvedValueOnce(null)
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' }, body: { name: 'X' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      rulesServiceMock.updateRule.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { name: 'X' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('DELETE /:id', () => {
    it('deletes a rule', async () => {
      const handler = findHandler('delete', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(rulesServiceMock.deleteRule).toHaveBeenCalledWith(1)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 404 when rule not found', async () => {
      rulesServiceMock.deleteRule.mockResolvedValueOnce(false)
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      rulesServiceMock.deleteRule.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})