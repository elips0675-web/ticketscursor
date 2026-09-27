import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    wiki_articles: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    wiki_revisions: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}))

import { listArticles, getArticleById, createArticle, updateArticle, listRevisions, getRevision, rollbackArticle } from '../wiki.service.js'
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

describe('updateArticle (Этап 65 — версионирование)', () => {
  it('updates article and creates a new revision with next number', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 1, title: 'v2', content: 'c2', category: 'Guide', tags: ['t'], author_id: 1, author_name: 'Admin' })
    prisma.wiki_revisions.findFirst.mockResolvedValue({ revision: 1 })
    prisma.wiki_revisions.create.mockResolvedValue({ id: 2, article_id: 1, revision: 2 })

    const result = await updateArticle({ id: 1, title: 'v2', content: 'c2', category: 'Guide', tags: ['t'], userId: 1, userName: 'Admin' })

    expect(result.title).toBe('v2')
    expect(prisma.wiki_articles.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ title: 'v2', updated_at: expect.any(Date) }),
    })
    expect(prisma.wiki_revisions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ article_id: 1, revision: 2, title: 'v2', author_name: 'Admin' }),
    }))
  })

  it('first revision gets number 1 when none exist', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 2, title: 'first', content: 'c', category: null, tags: [] })
    prisma.wiki_revisions.findFirst.mockResolvedValue(null)
    await updateArticle({ id: 2, title: 'first', content: 'c', userId: 1, userName: 'U' })
    expect(prisma.wiki_revisions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ revision: 1 }),
    }))
  })

  it('uses default category and empty tags when omitted', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 3, title: 'x', content: 'y', category: 'Другое', tags: [] })
    prisma.wiki_revisions.findFirst.mockResolvedValue(null)
    await updateArticle({ id: 3, title: 'x', content: 'y', userId: 1, userName: 'U' })
    expect(prisma.wiki_articles.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: expect.objectContaining({ category: 'Другое', tags: [] }),
    })
  })
})

describe('listRevisions', () => {
  it('returns revisions for an article, newest first', async () => {
    prisma.wiki_revisions.findMany.mockResolvedValue([{ id: 2, revision: 2 }, { id: 1, revision: 1 }])
    const result = await listRevisions(1)
    expect(result).toHaveLength(2)
    expect(prisma.wiki_revisions.findMany).toHaveBeenCalledWith({
      where: { article_id: 1 },
      orderBy: { revision: 'desc' },
    })
  })
})

describe('getRevision', () => {
  it('returns revision scoped to article', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue({ id: 2, revision: 2 })
    const result = await getRevision(2, 1)
    expect(result.revision).toBe(2)
    expect(prisma.wiki_revisions.findFirst).toHaveBeenCalledWith({ where: { id: 2, article_id: 1 } })
  })

  it('returns null for foreign revision', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue(null)
    const result = await getRevision(2, 999)
    expect(result).toBeNull()
  })
})

describe('rollbackArticle', () => {
  it('restores article from revision and creates a new snapshot', async () => {
    prisma.wiki_revisions.findFirst
      .mockResolvedValueOnce({ id: 5, article_id: 1, revision: 5, title: 'old', content: 'old-content', category: 'Guide', tags: ['x'] })
      .mockResolvedValueOnce({ revision: 5 })
    prisma.wiki_articles.update.mockResolvedValue({ id: 1, title: 'old', content: 'old-content', category: 'Guide', tags: ['x'] })
    prisma.wiki_revisions.create.mockResolvedValue({ id: 6, article_id: 1, revision: 6 })

    const result = await rollbackArticle({ id: 1, revisionId: 5, userId: 1, userName: 'U' })

    expect(prisma.wiki_articles.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ title: 'old', content: 'old-content' }),
    })
    expect(prisma.wiki_revisions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ article_id: 1, revision: 6, title: 'old' }),
    }))
    expect(result.article.title).toBe('old')
  })

  it('returns null when revision does not belong to article', async () => {
    prisma.wiki_revisions.findFirst.mockResolvedValue(null)
    const result = await rollbackArticle({ id: 1, revisionId: 999, userId: 1, userName: 'U' })
    expect(result).toBeNull()
    expect(prisma.wiki_articles.update).not.toHaveBeenCalled()
  })
})
