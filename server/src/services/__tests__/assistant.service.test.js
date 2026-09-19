import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    wiki_articles: { findMany: vi.fn() },
  },
}))

import {
  extractKeywords,
  rankArticles,
  searchWiki,
  buildAnswer,
  generateAssistantSuggestion,
} from '../assistant.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('extractKeywords', () => {
  it('extracts meaningful russian keywords', () => {
    const result = extractKeywords('Как настроить VPN для отдела продаж?')
    expect(result).toContain('настроить')
    expect(result).toContain('отдела')
    expect(result).not.toContain('для')
  })

  it('extracts english keywords', () => {
    const result = extractKeywords('VPN setup problem with laptop')
    expect(result).toContain('setup')
    expect(result).toContain('problem')
    expect(result).toContain('laptop')
    expect(result).not.toContain('with')
  })

  it('returns empty array for empty or short text', () => {
    expect(extractKeywords('')).toEqual([])
    expect(extractKeywords('a b c')).toEqual([])
  })

  it('deduplicates keywords', () => {
    const result = extractKeywords('vpn vpn vpn printer')
    expect(result.filter((k) => k === 'vpn')).toHaveLength(1)
  })
})

describe('rankArticles', () => {
  const articles = [
    { id: 1, title: 'VPN настройка', content: 'Инструкция по VPN', tags: ['vpn'] },
    { id: 2, title: 'Принтер', content: 'Как подключить принтер к сети', tags: [] },
  ]

  it('sorts by matching keyword count descending', () => {
    const ranked = rankArticles(articles, ['vpn', 'настройка'])
    expect(ranked[0].article.id).toBe(1)
    expect(ranked).toHaveLength(1)
  })

  it('excludes articles with no keyword match', () => {
    const ranked = rankArticles(articles, ['vmware'])
    expect(ranked).toEqual([])
  })

  it('handles missing tags and content', () => {
    const ranked = rankArticles([{ id: 3, title: 'X', content: null, tags: null }], ['vpn'])
    expect(ranked).toEqual([])
  })
})

describe('searchWiki', () => {
  it('returns ranked articles', async () => {
    prisma.wiki_articles.findMany.mockResolvedValue([
      { id: 1, title: 'VPN', content: 'vpn настройка', tags: ['vpn'] },
      { id: 2, title: 'Сеть', content: 'документация по сети', tags: [] },
    ])
    const result = await searchWiki(['vpn'])
    expect(result[0].id).toBe(1)
    expect(result).toHaveLength(1)
  })

  it('returns empty when no keywords', async () => {
    const result = await searchWiki([])
    expect(result).toEqual([])
    expect(prisma.wiki_articles.findMany).not.toHaveBeenCalled()
  })

  it('returns empty when no matches', async () => {
    prisma.wiki_articles.findMany.mockResolvedValue([
      { id: 1, title: 'VPN', content: 'vpn', tags: [] },
    ])
    const result = await searchWiki(['oracle'])
    expect(result).toEqual([])
  })
})

describe('buildAnswer', () => {
  it('asks for clarification when no keywords', () => {
    const answer = buildAnswer([], [])
    expect(answer).toContain('Не удалось выделить ключевые слова')
  })

  it('suggests manual search when no articles', () => {
    const answer = buildAnswer(['vpn'], [])
    expect(answer).toContain('подходящих статей')
    expect(answer).toContain('vpn')
  })

  it('lists found articles with snippets', () => {
    const answer = buildAnswer(['vpn'], [{ title: 'Настройка VPN', content: 'Длинный текст инструкции по настройке VPN на рабочем компьютере.', category: 'Guide' }])
    expect(answer).toContain('Настройка VPN')
  })
})

describe('generateAssistantSuggestion', () => {
  it('returns template answer with sources when no LLM configured', async () => {
    prisma.wiki_articles.findMany.mockResolvedValue([
      { id: 1, title: 'VPN настройка', content: 'Инструкция по VPN', tags: [] },
    ])
    const result = await generateAssistantSuggestion({
      ticket: { id: 1, title: 'Не работает VPN', description: 'Настройка VPN на ноутбуке' },
      messages: [{ text: 'Помогите с VPN' }],
      useLlm: false,
    })
    expect(result.usedLlm).toBe(false)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].title).toBe('VPN настройка')
    expect(result.answer).toBeTruthy()
    expect(result.keywords).toContain('vpn')
  })

  it('returns empty sources when knowledge base empty', async () => {
    prisma.wiki_articles.findMany.mockResolvedValue([])
    const result = await generateAssistantSuggestion({
      ticket: { id: 1, title: 'VPN не настраивается', description: 'Проблема с vpn' },
      messages: [],
      useLlm: false,
    })
    expect(result.sources).toEqual([])
    expect(result.answer).toContain('не найдено')
  })
})