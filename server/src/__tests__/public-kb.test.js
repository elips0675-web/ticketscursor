import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

    it('находит статью по числовому id, если slug ещё не сгенерирован', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({
        id: 7,
        title: 'Без slug',
        slug: null,
        content: null,
        category: 'IT',
      })
      const handler = findHandler('get', '/articles/:slug')
      const { req, res } = mockReqRes({ params: { slug: '7' } })
      await handler(req, res)
      expect(prismaMock.wiki_articles.findFirst).toHaveBeenCalledWith({
        where: { published: true, deleted_at: null, id: 7 },
      })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
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
    it('records a vote and returns fresh counts', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({ id: 1 })
      prismaMock.$queryRaw.mockResolvedValueOnce([{ vote_type: 'up', cnt: 1 }])
      const handler = findHandler('post', '/articles/:id/vote')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'up' } })
      await handler(req, res)
      expect(prismaMock.$executeRaw).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { up: 1, down: 0 } })
    })

    it('records a down vote', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({ id: 2 })
      prismaMock.$queryRaw.mockResolvedValueOnce([{ vote_type: 'down', cnt: 4 }])
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '2' }, body: { vote: 'down' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { up: 0, down: 4 } })
    })

    it('returns 400 for invalid vote', async () => {
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'sideways' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when article is not published or missing', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce(null)
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '999' }, body: { vote: 'up' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled()
    })

    it('returns 500 when the vote insert fails (no fake success)', async () => {
      prismaMock.wiki_articles.findFirst.mockResolvedValueOnce({ id: 1 })
      prismaMock.$executeRaw.mockRejectedValueOnce(new Error('insert failed'))
      const handler = findHandler('post', '/articles/:id/vote')
      const { req, res } = mockReqRes({ params: { id: '1' }, body: { vote: 'up' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Failed to vote' })
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

  describe('схема БД под запросы роута', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

    function modelFields(schema, model) {
      const block = schema.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`))
      if (!block) return null
      return block[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0])
    }

    it('wiki_articles содержит published, deleted_at и slug (иначе 500 на всех чтениях)', () => {
      const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8')
      const fields = modelFields(schema, 'wiki_articles')
      expect(fields).not.toBeNull()
      for (const field of ['published', 'deleted_at', 'slug']) {
        expect(fields).toContain(field)
      }
    })

    it('article_votes объявлена моделью, а не создаётся запросом в рантайме', () => {
      const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8')
      const fields = modelFields(schema, 'article_votes')
      expect(fields).not.toBeNull()
      expect(fields).toEqual(expect.arrayContaining(['article_id', 'vote_type', 'ip_address']))
    })

    it('колонки wiki_articles приходят миграцией, а не только объявлены в prisma', () => {
      const dir = join(root, 'migrations')
      const sources = readdirSync(dir)
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFileSync(join(dir, file), 'utf8'))
        .join('\n')
      expect(sources).toContain('ADD COLUMN `published`')
      expect(sources).toContain('ADD COLUMN `slug`')
      expect(sources).toContain("createTable('article_votes'")
    })
  })
})