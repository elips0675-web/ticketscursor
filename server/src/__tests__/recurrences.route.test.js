import { describe, it, expect, vi, beforeEach } from 'vitest'

const recurrenceServiceMock = {
  listRecurrences: vi.fn().mockResolvedValue([{ id: 1, title: 'Rec 1' }]),
  getRecurrenceById: vi.fn().mockResolvedValue({ id: 1, title: 'Rec 1' }),
  createRecurrence: vi.fn().mockResolvedValue({ id: 1, title: 'New Rec' }),
  updateRecurrence: vi.fn().mockResolvedValue({ id: 1, title: 'Updated' }),
  deleteRecurrence: vi.fn().mockResolvedValue(true),
}

vi.mock('../middleware.js', () => ({
  authenticateToken: (req, _res, next) => { req.user = { userId: 1, role: 'admin' }; next() },
  requireRole: () => (_req, _res, next) => next(),
}))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../services/recurrence.service.js', () => recurrenceServiceMock)

describe('recurrences route', () => {
  let router

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/recurrences.js')
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

  describe('GET /', () => {
    it('lists recurrences', async () => {
      const handler = findHandler('get', '/')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(recurrenceServiceMock.listRecurrences).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 500 on service error', async () => {
      recurrenceServiceMock.listRecurrences.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /:id', () => {
    it('returns recurrence', async () => {
      const handler = findHandler('get', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(recurrenceServiceMock.getRecurrenceById).toHaveBeenCalledWith(1)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 404 when not found', async () => {
      recurrenceServiceMock.getRecurrenceById.mockResolvedValueOnce(null)
      const handler = findHandler('get', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      recurrenceServiceMock.getRecurrenceById.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('POST /', () => {
    it('creates a recurrence', async () => {
      const handler = findHandler('post', '/')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ body: { title: 'New Rec', cron_expr: '0 9 * * 1' } })
      await handler(req, res)
      expect(recurrenceServiceMock.createRecurrence).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Rec', cronExpr: '0 9 * * 1', createdBy: 1 }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when title is missing', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { cron_expr: '0 9 * * 1' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when cron is missing', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { title: 'Rec' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when cron is invalid', async () => {
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { title: 'Rec', cron_expr: 'not-a-cron' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 500 on service error', async () => {
      recurrenceServiceMock.createRecurrence.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('post', '/')
      const { req, res } = mockReqRes({ body: { title: 'Rec', cron_expr: '0 9 * * 1' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('PUT /:id', () => {
    it('updates a recurrence', async () => {
      const handler = findHandler('put', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { title: 'Updated' } })
      await handler(req, res)
      expect(recurrenceServiceMock.updateRecurrence).toHaveBeenCalledWith(1, { title: 'Updated' })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when cron is invalid', async () => {
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { cron_expr: 'bad-cron' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when not found', async () => {
      recurrenceServiceMock.updateRecurrence.mockResolvedValueOnce(null)
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' }, body: { title: 'X' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      recurrenceServiceMock.updateRecurrence.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('put', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { title: 'X' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('DELETE /:id', () => {
    it('deletes a recurrence', async () => {
      const handler = findHandler('delete', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(recurrenceServiceMock.deleteRecurrence).toHaveBeenCalledWith(1)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 404 when not found', async () => {
      recurrenceServiceMock.deleteRecurrence.mockResolvedValueOnce(false)
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 500 on service error', async () => {
      recurrenceServiceMock.deleteRecurrence.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})