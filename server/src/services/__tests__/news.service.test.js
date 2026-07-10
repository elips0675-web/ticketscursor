import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    news_posts: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}))

import { listNews, createNews } from '../news.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('listNews', () => {
  it('returns paginated news', async () => {
    prisma.news_posts.count.mockResolvedValue(10)
    prisma.news_posts.findMany.mockResolvedValue([
      { id: 1, title: 'News 1', content: '...', important: true, author_id: 1, author_name: 'Admin', created_at: new Date() },
    ])
    const result = await listNews({ page: 1, limit: 10, important: undefined, q: undefined })
    expect(result.total).toBe(10)
    expect(result.data).toHaveLength(1)
    expect(result.totalPages).toBe(1)
  })

  it('filters by important', async () => {
    prisma.news_posts.count.mockResolvedValue(0)
    prisma.news_posts.findMany.mockResolvedValue([])
    await listNews({ page: 1, limit: 10, important: 'true', q: undefined })
    expect(prisma.news_posts.count).toHaveBeenCalledWith({ where: { important: true } })
  })

  it('searches by title or content', async () => {
    prisma.news_posts.count.mockResolvedValue(0)
    prisma.news_posts.findMany.mockResolvedValue([])
    await listNews({ page: 1, limit: 10, important: undefined, q: 'test' })
    const where = prisma.news_posts.count.mock.calls[0][0].where
    expect(where.OR).toBeDefined()
    expect(where.OR[0].title).toEqual({ contains: 'test' })
  })
})

describe('createNews', () => {
  it('creates news with provided data', async () => {
    prisma.news_posts.create.mockResolvedValue({ id: 1 })
    await createNews({ title: 'Title', content: 'Content', important: true, userId: 1, userName: 'Admin' })
    expect(prisma.news_posts.create).toHaveBeenCalledWith({
      data: { title: 'Title', content: 'Content', important: true, author_id: 1, author_name: 'Admin' },
    })
  })

  it('defaults important to false', async () => {
    prisma.news_posts.create.mockResolvedValue({ id: 1 })
    await createNews({ title: 'T', content: 'C', important: false, userId: 1, userName: 'U' })
    expect(prisma.news_posts.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ important: false }) })
    )
  })
})
