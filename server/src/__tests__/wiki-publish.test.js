// KB-02: публикация статей в /kb — slug из заголовка с уникализацией,
// published в create/update, снятие с публикации не стирает slug.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  default: {
    wiki_articles: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    wiki_revisions: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

import prisma from '../prisma.js'
import { slugify, createArticle, updateArticle } from '../services/wiki.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  prisma.wiki_articles.findFirst.mockResolvedValue(null)
  prisma.wiki_revisions.findFirst.mockResolvedValue(null)
  prisma.wiki_revisions.create.mockResolvedValue({})
})

describe('slugify (KB-02)', () => {
  it('транслитерирует кириллицу в латиницу', () => {
    expect(slugify('Инструкция по VPN')).toBe('instruktsiya-po-vpn')
  })

  it('убирает пунктуацию и схлопывает разделители', () => {
    expect(slugify('Ёлка & 2026 — тест!')).toBe('elka-2026-test')
  })

  it('не оставляет пустой slug', () => {
    expect(slugify('!!!')).toBe('article')
    expect(slugify('')).toBe('article')
    expect(slugify(undefined)).toBe('article')
  })

  it('ограничивает длину 200 символами без хвостового дефиса', () => {
    const slug = slugify('a '.repeat(150))
    expect(slug.length).toBeLessThanOrEqual(200)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('createArticle: slug + published (KB-02)', () => {
  it('публикует статью и генерирует slug из заголовка', async () => {
    prisma.wiki_articles.create.mockResolvedValue({ id: 1 })

    await createArticle({
      title: 'Инструкция по VPN', content: 'Текст', userId: 42, userName: 'Admin', published: true,
    })

    expect(prisma.wiki_articles.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'instruktsiya-po-vpn',
        published: true,
        author_id: 42,
        author_name: 'Admin',
      }),
    })
  })

  it('по умолчанию создаёт черновик (published=false)', async () => {
    prisma.wiki_articles.create.mockResolvedValue({ id: 2 })

    await createArticle({ title: 'Черновик', content: 'Текст', userId: 7, userName: 'Agent' })

    expect(prisma.wiki_articles.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ published: false }),
    })
  })

  it('уникализирует slug суффиксом при коллизии', async () => {
    prisma.wiki_articles.findFirst
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null)
    prisma.wiki_articles.create.mockResolvedValue({ id: 3 })

    await createArticle({ title: 'VPN', content: 'Текст', userId: 1, userName: 'Admin' })

    expect(prisma.wiki_articles.findFirst).toHaveBeenNthCalledWith(1, {
      where: { slug: 'vpn' },
      select: { id: true },
    })
    expect(prisma.wiki_articles.findFirst).toHaveBeenNthCalledWith(2, {
      where: { slug: 'vpn-2' },
      select: { id: true },
    })
    expect(prisma.wiki_articles.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: 'vpn-2' }),
    })
  })

  it('нормализует явный slug', async () => {
    prisma.wiki_articles.create.mockResolvedValue({ id: 4 })

    await createArticle({
      title: 'Заголовок', content: 'Текст', userId: 1, userName: 'Admin', slug: 'Мой VPN',
    })

    expect(prisma.wiki_articles.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: 'moy-vpn' }),
    })
  })
})

describe('updateArticle: публикация и slug (KB-02)', () => {
  it('снимает с публикации и сохраняет ревизию', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 1, published: false })

    await updateArticle({
      id: 1, title: 'VPN', content: 'Текст', userId: 42, userName: 'Admin', published: false,
    })

    expect(prisma.wiki_articles.update.mock.calls[0][0].data.published).toBe(false)
    expect(prisma.wiki_revisions.create).toHaveBeenCalled()
  })

  it('не трогает published, если поле не передано', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 1 })

    await updateArticle({ id: 1, title: 'VPN', content: 'Текст', userId: 42, userName: 'Admin' })

    expect(prisma.wiki_articles.update.mock.calls[0][0].data).not.toHaveProperty('published')
  })

  it('меняет slug с проверкой уникальности, исключая свою статью', async () => {
    prisma.wiki_articles.update.mockResolvedValue({ id: 5, slug: 'novyy-adres' })

    await updateArticle({
      id: 5, title: 'VPN', content: 'Текст', userId: 1, userName: 'Admin', slug: 'Новый адрес',
    })

    expect(prisma.wiki_articles.findFirst).toHaveBeenCalledWith({
      where: { slug: 'novyy-adres', NOT: { id: 5 } },
      select: { id: true },
    })
    expect(prisma.wiki_articles.update.mock.calls[0][0].data.slug).toBe('novyy-adres')
  })
})
