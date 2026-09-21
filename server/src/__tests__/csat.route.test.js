import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/csat.service.js', () => ({
  getSurveyByToken: vi.fn(),
  submitResponse: vi.fn(),
  getCsatStats: vi.fn(),
  getRecentSurveys: vi.fn(),
}))

vi.mock('../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn() } }))

describe('csat routes', () => {
  let csatRouter

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/csat.js')
    csatRouter = mod.default
  })

  function mockReqRes(overrides = {}) {
    const req = { params: {}, query: {}, body: {}, ...overrides }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()
    return { req, res, next }
  }

  function findHandler(method, path) {
    const stack = csatRouter.stack
    for (const layer of stack) {
      if (layer.route && layer.route.path === path && layer.route.methods[method]) {
        return layer.route.stack[layer.route.stack.length - 1].handle
      }
    }
    return null
  }

  describe('GET /:token', () => {
    it('returns survey data', async () => {
      const { getSurveyByToken } = await import('../services/csat.service.js')
      getSurveyByToken.mockResolvedValue({
        id: 1, ticket_id: 10, rating: null, comment: null, responded_at: null,
        ticket: { title: 'Bug', status: 'open' },
      })

      const handler = findHandler('get', '/:token')
      const { req, res, next } = mockReqRes({ params: { token: 'abc123' } })
      await handler(req, res, next)

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ ticket_id: 10 }),
        alreadyResponded: false,
      })
    })

    it('returns alreadyResponded when survey has response', async () => {
      const { getSurveyByToken } = await import('../services/csat.service.js')
      getSurveyByToken.mockResolvedValue({
        id: 1, ticket_id: 10, rating: 5, comment: 'Good', responded_at: new Date(),
        ticket: { title: 'Bug', status: 'closed' },
      })

      const handler = findHandler('get', '/:token')
      const { req, res, next } = mockReqRes({ params: { token: 'abc123' } })
      await handler(req, res, next)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ alreadyResponded: true })
      )
    })

    it('returns 404 for invalid token', async () => {
      const { getSurveyByToken } = await import('../services/csat.service.js')
      getSurveyByToken.mockResolvedValue(null)

      const handler = findHandler('get', '/:token')
      const { req, res, next } = mockReqRes({ params: { token: 'invalid' } })
      await handler(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    })
  })

  describe('POST /:token', () => {
    it('submits a response', async () => {
      const { submitResponse } = await import('../services/csat.service.js')
      submitResponse.mockResolvedValue({ success: true })

      const handler = findHandler('post', '/:token')
      const { req, res, next } = mockReqRes({
        params: { token: 'abc123' },
        body: { rating: 5, comment: 'Great!' },
      })
      await handler(req, res, next)

      expect(submitResponse).toHaveBeenCalledWith('abc123', { rating: 5, comment: 'Great!' })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { success: true } })
    })

    it('returns 400 for invalid rating', async () => {
      const { submitResponse } = await import('../services/csat.service.js')
      const err = new Error('Rating must be 1-5')
      err.statusCode = 400
      submitResponse.mockRejectedValue(err)

      const handler = findHandler('post', '/:token')
      const { req, res, next } = mockReqRes({
        params: { token: 'abc123' },
        body: { rating: 6 },
      })
      await handler(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Rating must be 1-5' }))
    })

    it('returns 404 for unknown token', async () => {
      const { submitResponse } = await import('../services/csat.service.js')
      const err = new Error('Survey not found')
      err.statusCode = 404
      submitResponse.mockRejectedValue(err)

      const handler = findHandler('post', '/:token')
      const { req, res, next } = mockReqRes({
        params: { token: 'nonexistent' },
        body: { rating: 5 },
      })
      await handler(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
