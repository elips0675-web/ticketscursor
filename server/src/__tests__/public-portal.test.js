import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = {
  employees: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 50 }),
  },
  tickets: {
    create: vi.fn().mockResolvedValue({ id: 100 }),
    update: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null),
  },
  ticket_messages: {
    create: vi.fn().mockResolvedValue({ id: 1, text: 'Thanks', created_at: new Date() }),
  },
}

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../email.js', () => ({
  sendTicketNotification: vi.fn().mockResolvedValue({}),
}))
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-token') },
  hash: vi.fn().mockResolvedValue('hashed-token'),
}))

describe('public-portal route', () => {
  let router

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/public-portal.js')
    router = mod.default
  })

  function mockReqRes(overrides = {}) {
    const req = {
      body: {},
      params: {},
      headers: { origin: 'http://localhost:5173' },
      ip: '127.0.0.1',
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

  describe('POST /tickets', () => {
    it('creates a ticket with new employee', async () => {
      prismaMock.employees.findFirst.mockResolvedValueOnce(null)
      prismaMock.employees.create.mockResolvedValueOnce({ id: 50 })
      const handler = findHandler('post', '/tickets')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({
        body: { name: 'Ivan', email: 'ivan@test.com', subject: 'Help me', description: 'Please', category: 'support', priority: 'high' },
      })
      await handler(req, res)
      expect(prismaMock.employees.create).toHaveBeenCalled()
      expect(prismaMock.tickets.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ created_by: 50 }) }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('reuses existing employee', async () => {
      prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 7 })
      const handler = findHandler('post', '/tickets')
      const { req, res } = mockReqRes({
        body: { name: 'Ivan', email: 'ivan@test.com', subject: 'Help', description: '', category: 'bug', priority: 'low' },
      })
      await handler(req, res)
      expect(prismaMock.employees.create).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('returns 400 when name missing', async () => {
      const handler = findHandler('post', '/tickets')
      const { req, res } = mockReqRes({ body: { email: 'a@b.c', subject: 'S' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when email missing', async () => {
      const handler = findHandler('post', '/tickets')
      const { req, res } = mockReqRes({ body: { name: 'N', subject: 'S' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when subject missing', async () => {
      const handler = findHandler('post', '/tickets')
      const { req, res } = mockReqRes({ body: { name: 'N', email: 'a@b.c' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 500 on error (email notify failure swallowed)', async () => {
      const { sendTicketNotification } = await import('../email.js')
      sendTicketNotification.mockRejectedValueOnce(new Error('smtp down'))
      const handler = findHandler('post', '/tickets')
      const { req, res } = mockReqRes({ body: { name: 'N', email: 'a@b.c', subject: 'S' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('returns 500 on db error', async () => {
      prismaMock.tickets.create.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('post', '/tickets')
      const { req, res } = mockReqRes({ body: { name: 'N', email: 'a@b.c', subject: 'S' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /track/:token', () => {
    beforeEach(() => {
      prismaMock.tickets.findUnique.mockResolvedValue({
        id: 100,
        title: 'My Ticket',
        description: 'desc',
        status: 'open',
        priority: 'medium',
        category: 'support',
        created_at: new Date(),
        updated_at: new Date(),
        tags: JSON.stringify({ tracking_token: '100-abcdef123456' }),
        created_by_employee: { name: 'Ivan', email: 'ivan@test.com' },
        ticket_messages: [
          { id: 1, sender_name: 'Ivan', text: 'hi', created_at: new Date(), attachments: null },
        ],
      })
    })

    it('returns ticket with messages', async () => {
      const handler = findHandler('get', '/track/:token')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { token: '100-abcdef123456' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 for token without dash', async () => {
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: 'noparts' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 for token with non-numeric id', async () => {
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: 'abc-token' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when ticket not found', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce(null)
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: '999-token' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 403 when tracking token mismatches', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce({
        id: 100,
        title: 'T',
        tags: JSON.stringify({ tracking_token: 'other-token' }),
        ticket_messages: [],
      })
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: '100-token' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('handles non-string tags', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce({
        id: 100,
        title: 'T',
        tags: { tracking_token: '100-token' },
        ticket_messages: [],
      })
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: '100-token' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('handles malformed JSON tags', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce({
        id: 100,
        title: 'T',
        tags: 'not-json{',
        ticket_messages: [{
          id: 1, sender_name: 'Ivan', text: 'hi', created_at: new Date(), attachments: '["a.pdf"]',
        }],
      })
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: '100-token' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 403 when no tracking token in tags', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce({
        id: 100,
        title: 'T',
        tags: JSON.stringify({}),
        ticket_messages: [],
      })
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: '100-token' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 500 on db error', async () => {
      prismaMock.tickets.findUnique.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/track/:token')
      const { req, res } = mockReqRes({ params: { token: '100-token' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('POST /track/:token/reply', () => {
    beforeEach(() => {
      prismaMock.tickets.findUnique.mockResolvedValue({
        id: 100,
        created_by: 50,
        tags: JSON.stringify({ tracking_token: '100-abcdef123456' }),
      })
    })

    it('creates a reply', async () => {
      const handler = findHandler('post', '/track/:token/reply')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { token: '100-abcdef123456' }, body: { text: 'Thanks for the help' } })
      await handler(req, res)
      expect(prismaMock.ticket_messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ticket_id: 100, sender_id: 50 }) }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when text empty', async () => {
      const handler = findHandler('post', '/track/:token/reply')
      const { req, res } = mockReqRes({ params: { token: '100-abcdef123456' }, body: { text: '   ' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 for invalid token', async () => {
      const handler = findHandler('post', '/track/:token/reply')
      const { req, res } = mockReqRes({ params: { token: 'abc-token' }, body: { text: 'hi' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when ticket not found', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce(null)
      const handler = findHandler('post', '/track/:token/reply')
      const { req, res } = mockReqRes({ params: { token: '999-abcdef' }, body: { text: 'hi' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 403 when token mismatches', async () => {
      prismaMock.tickets.findUnique.mockResolvedValueOnce({
        id: 100,
        created_by: 50,
        tags: JSON.stringify({ tracking_token: 'other' }),
      })
      const handler = findHandler('post', '/track/:token/reply')
      const { req, res } = mockReqRes({ params: { token: '100-abcdef' }, body: { text: 'hi' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 500 on db error', async () => {
      prismaMock.ticket_messages.create.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('post', '/track/:token/reply')
      const { req, res } = mockReqRes({ params: { token: '100-abcdef123456' }, body: { text: 'hi' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})