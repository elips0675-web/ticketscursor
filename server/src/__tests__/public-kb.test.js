import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = {
  wiki_articles: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
  },
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(1),
}

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

describe('public-kb route', () => {
  let router

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/public-kb.js')
    router = mod.default
  })

  function mockReqRes(overrides = {}) {
    const req = {
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
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

  describe('GET /articles', () => {
    it('lists published articles with pagination', async () => {
      prismaMock.wiki_articles.findMany.mockResolvedValueOnce([
        { id: 1, title: 'How to', slug: 'how-to', content: '## Text', category: 'IT', created_at: new Date(), updated_at: new Date() },
      ])
      prismaMock.wiki_articles.count.mockResolvedValueOnce(1)
      const handler = findHandler('get', '/articles')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ query: { page: '1', limit: '20' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pagination: expect.objectContaining({ totalPages: 1 }),
        }),
      )
    })

    it('filters by category and q', async () => {
      prismaMock.wiki_articles.findMany.mockResolvedValueOnce([])
      prismaMock.wiki_articles.count.mockResolvedValueOnce(0)
      const handler = findHandler('get', '/articles')
      const { req, res } = mockReqRes({ query: { category: 'IT', q: 'install' } })
      await handler(req, res)
      expect(prismaMock.wiki_articles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ category: 'IT', OR: expect.any(Array) }) }),
      )
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 500 on error', async () => {
      prismaMock.wiki_articles.findMany.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/articles')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /articles/:slug', () => {
    it('returns article with votes and similar', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({
        id: 1,
        title: 'How to',
        slug: 'how-to',
        content: 'A long content section with useful words about setting things up properly here',
        category: 'IT',
        created_at: new Date(),
        updated_at: new Date(),
      })
      prismaMock.$queryRaw.mockResolvedValueOnce([{ vote_type: 'up', cnt: 3 }])
      prismaMock.wiki_articles.findMany.mockResolvedValueOnce([
        { id: 2, title: 'Similar', slug: 'similar', category: 'IT' },
      ])
      const handler = findHandler('get', '/articles/:slug')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { slug: 'how-to' } })
      await handler(req, res)
      const call = res.json.mock.calls[0][0]
      expect(call.success).toBe(true)
      expect(call.data.votes.up).toBe(3)
      expect(call.data.similar.length).toBe(1)
    })

    it('returns 404 when article not found', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce(null)
      const handler = findHandler('get', '/articles/:slug')
      const { req, res } = mockReqRes({ params: { slug: 'missing' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('handles votes query failure gracefully', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({
        id: 1,
        title: 'T',
        slug: 't',
        content: 'Content with some longer words to produce similar',
        category: 'IT',
      })
      prismaMock.$queryRaw.mockRejectedValueOnce(new Error('no table'))
      const handler = findHandler('get', '/articles/:slug')
      const { req, res } = mockReqRes({ params: { slug: 't' } })
      await handler(req, res)
      const call = res.json.mock.calls[0][0]
      expect(call.success).toBe(true)
      expect(call.data.votes).toEqual({ up: 0, down: 0 })
    })

    it('handles article without content', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({
        id: 1,
        title: 'T',
        slug: 't',
        content: null,
        category: 'IT',
      })
      const handler = findHandler('get', '/articles/:slug')
      const { req, res } = mockReqRes({ params: { slug: 't' } })
      await handler(req, res)
      const call = res.json.mock.calls[0][0]
      expect(call.success).toBe(true)
      expect(call.data.similar).toEqual([])
    })

    it('returns 500 on error', async () => {
      prismaMock.wiki_articles.findFirst.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/articles/:slug')
      const { req, res } = mockReqRes({ params: { slug: 't' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /categories', () => {
    it('returns categories (distinct)', async () => {
      prismaMock.wiki_articles.findMany.mockResolvedValueOnce([
        { category: 'IT' },
        { category: null },
        { category: 'HR' },
      ])
      const handler = findHandler('get', '/categories')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(prismaMock.wiki_articles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ distinct: ['category'] }),
      )
      const call = res.json.mock.calls[0][0]
      expect(call.data).toEqual(['IT', 'HR'])
    })

    it('returns 500 on error', async () => {
      prismaMock.wiki_articles.findMany.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/categories')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('POST /articles/:id/vote', () => {
    it('records a vote', async () => {
      const handler = findHandler('post', '/articles/:id/vote')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'up' } })
      await handler(req, res)
      expect(prismaMock.$executeRaw).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })

    it('records a down vote', async () => {
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '2' }, body: { vote: 'down' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })

    it('returns 400 for invalid vote', async () => {
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'sideways' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('tolerates vote insert failure (table race)', async () => {
      prismaMock.$executeRaw.mockRejectedValueOnce(new Error('table'))
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'up' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })

    it('tolerates repeated vote failures (best-effort)', async () => {
      // оба $executeRaw (CREATE + INSERT) находятся внутри одного try/catch —
      // ошибки глотаются, роут всегда отвечает success
      prismaMock.$executeRaw.mockRejectedValue(new Error('boom'))
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'down' } })
      await handler(req, res)
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })
  })

  describe('GET /search', () => {
    it('returns empty when no q', async () => {
      const handler = findHandler('get', '/search')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ query: {} })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] })
      expect(prismaMock.wiki_articles.findMany).not.toHaveBeenCalled()
    })

    it('searches articles', async () => {
      prismaMock.wiki_articles.findMany.mockResolvedValueOnce([
        { id: 1, title: 'Result', slug: 'result', category: 'IT', content: 'long content here' },
      ])
      const handler = findHandler('get', '/search')
      const { req, res } = mockReqRes({ query: { q: 'install' } })
      await handler(req, res)
      const call = res.json.mock.calls[0][0]
      expect(call.data.length).toBe(1)
      expect(call.data[0].excerpt).toBeDefined()
    })

    it('returns 500 on error', async () => {
      prismaMock.wiki_articles.findMany.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/search')
      const { req, res } = mockReqRes({ query: { q: 'x' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})