import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    employees: {
      findMany: vi.fn(),
    },
  },
}))

import prisma from '../../prisma.js'
import { extractMentionTokens, resolveMentionedEmployees } from '../tickets.service.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('extractMentionTokens', () => {
  it('returns empty array for empty or null text', () => {
    expect(extractMentionTokens('')).toEqual([])
    expect(extractMentionTokens(null)).toEqual([])
    expect(extractMentionTokens(undefined)).toEqual([])
  })

  it('extracts single-word mentions', () => {
    expect(extractMentionTokens('Привет @Алексей')).toEqual(['Алексей'])
  })

  it('extracts only the first word of a full name as a token', () => {
    expect(extractMentionTokens('Смотри @Алексей Петров пожалуйста')).toEqual(['Алексей'])
  })

  it('extracts multiple mentions and deduplicates by start', () => {
    expect(extractMentionTokens('@Мария и @Алексей Петров')).toEqual(['Мария', 'Алексей'])
  })

  it('does not match @ inside an email address', () => {
    expect(extractMentionTokens('почта на example.com, но также @Иван')).toEqual(['Иван'])
  })

  it('ignores @ when alone or followed by whitespace', () => {
    expect(extractMentionTokens('просто @ символ')).toEqual([])
  })
})

describe('resolveMentionedEmployees', () => {
  const employees = [
    { id: 1, name: 'Алексей Петров', email: 'alexey@example.com' },
    { id: 2, name: 'Мария Иванова', email: 'maria@example.com' },
    { id: 3, name: 'Дмитрий Сидоров', email: 'dmitry@example.com' },
  ]

  beforeEach(() => {
    prisma.employees.findMany.mockResolvedValue(employees)
  })

  it('returns [] when no mentions present', async () => {
    const result = await resolveMentionedEmployees('Просто текст', 1)
    expect(result).toEqual([])
    expect(prisma.employees.findMany).not.toHaveBeenCalled()
  })

  it('resolves by full name', async () => {
    const result = await resolveMentionedEmployees('Привет @Мария Иванова!', 1)
    expect(result).toEqual([2])
  })

  it('resolves by email prefix', async () => {
    const result = await resolveMentionedEmployees('Дмитрий писал, что @dmitry занят', 1)
    expect(result).toEqual([3])
  })

  it('excludes the sender from mentions', async () => {
    const result = await resolveMentionedEmployees('Я @Алексей Петров сам напишу', 1)
    expect(result).toEqual([])
  })

  it('resolves multiple distinct mentions', async () => {
    const result = await resolveMentionedEmployees('Обратитесь @Мария Иванова и @dmitry', 1)
    expect(result).toEqual([2, 3])
  })

  it('ignores unknown mentions silently', async () => {
    const result = await resolveMentionedEmployees('Спросите @Незнакомец', 1)
    expect(result).toEqual([])
  })

  it('passes exclusion (NOT id) to the query', async () => {
    await resolveMentionedEmployees('напишите @Мария Иванова', 9)
    const query = prisma.employees.findMany.mock.calls[0][0]
    expect(query.where.is_active).toBe(true)
    expect(query.where.NOT).toEqual({ id: 9 })
    expect(query.select).toHaveProperty('id')
    expect(query.select).toHaveProperty('name')
  })
})