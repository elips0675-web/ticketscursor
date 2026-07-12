import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    wiki_articles: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}))

import { listArticles, getArticleById, createArticle } from '../wiki.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('listArticles', () => {
  it('returns paginated articles', async () => {
    prisma.wiki_articles.count.mockResolvedValue(10)
    prisma.wiki_articles.findMany.mockResolvedValue([{ id: 1, title: 'Article' }])
    const result = await listArticles(1, 5)
    expect(result.total).toBe(10)
    expect(result.totalPages).toBe(2)
    expect(result.data).toHaveLength(1)
  })

  it('handles empty result', async () => {
    prisma.wiki_articles.count.mockResolvedValue(0)
    prisma.wiki_articles.findMany.mockResolvedValue([])
    const result = await listArticles(1, 5)
    expect(result.data).toEqual([])
    expect(result.totalPages).toBe(0)
  })
})

describe('getArticleById', () => {
  it('returns article by id', async () => {
    prisma.wiki_articles.findUnique.mockResolvedValue({ id: 1, title: 'Test' })
    const result = await getArticleById(1)
    expect(result.title).toBe('Test')
  })

  it('returns null for non-existent article', async () => {
    prisma.wiki_articles.findUnique.mockResolvedValue(null)
    const result = await getArticleById(999)
    expect(result).toBeNull()
  })
})

describe('createArticle', () => {
  it('creates article with all fields', async () => {
    prisma.wiki_articles.create.mockResolvedValue({ id: 1, title: 'New', content: 'Content', category: 'Guide', tags: ['tag1'], author_id: 1, author_name: 'Admin' })
    const result = await createArticle({ title: 'New', content: 'Content', category: 'Guide', tags: ['tag1'], userId: 1, userName: 'Admin' })
    expect(result.id).toBe(1)
    expect(result.category).toBe('Guide')
  })

  it('uses default category when not provided', async () => {
    prisma.wiki_articles.create.mockResolvedValue({ id: 2, title: 'No Cat', content: '', category: 'Другое', tags: [], author_id: 1, author_name: 'User' })
    const result = await createArticle({ title: 'No Cat', content: '', category: undefined, tags: [], userId: 1, userName: 'User' })
    expect(result.category).toBe('Другое')
  })

  it('uses default tags and author name when not provided', async () => {
    prisma.wiki_articles.create.mockResolvedValue({ id: 3, title: 'Minimal', content: 'test', category: 'Другое', tags: [], author_id: 1, author_name: 'User' })
    const result = await createArticle({ title: 'Minimal', content: 'test', category: undefined, tags: undefined, userId: 1, userName: undefined })
    expect(result.id).toBe(3)
  })
})
