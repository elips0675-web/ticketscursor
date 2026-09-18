import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    time_entries: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    ticket_timers: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import {
  listTimeEntries,
  getTimeTotals,
  addTimeEntry,
  getTimeEntryById,
  deleteTimeEntry,
  getActiveTimer,
  startTimer,
  stopTimer,
  formatDuration,
} from '../time.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('listTimeEntries', () => {
  it('returns entries with user and desc order', async () => {
    prisma.time_entries.findMany.mockResolvedValue([{ id: 1, minutes: 30, user: { name: 'A' } }])
    const result = await listTimeEntries(7)
    expect(prisma.time_entries.findMany).toHaveBeenCalledWith({
      where: { ticket_id: 7 },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { created_at: 'desc' },
      take: 50,
    })
    expect(result[0].user.name).toBe('A')
  })
})

describe('getTimeTotals', () => {
  it('returns sum and count', async () => {
    prisma.time_entries.aggregate.mockResolvedValue({ _sum: { minutes: 95 }, _count: 3 })
    const result = await getTimeTotals(7)
    expect(result).toEqual({ totalMinutes: 95, totalEntries: 3 })
  })

  it('defaults total to 0 when empty', async () => {
    prisma.time_entries.aggregate.mockResolvedValue({ _sum: { minutes: null }, _count: 0 })
    const result = await getTimeTotals(7)
    expect(result).toEqual({ totalMinutes: 0, totalEntries: 0 })
  })
})

describe('addTimeEntry', () => {
  it('creates entry with today date and returns with user', async () => {
    prisma.time_entries.create.mockResolvedValue({ id: 10, minutes: 45, user: { name: 'A' } })
    const result = await addTimeEntry({ ticketId: 7, userId: 3, minutes: 45, description: 'fix' })
    expect(prisma.time_entries.create).toHaveBeenCalledWith({
      data: {
        ticket_id: 7,
        user_id: 3,
        minutes: 45,
        description: 'fix',
        entry_date: expect.any(Date),
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })
    expect(result.id).toBe(10)
  })

  it('defaults description to empty string', async () => {
    prisma.time_entries.create.mockResolvedValue({ id: 11 })
    await addTimeEntry({ ticketId: 7, userId: 3, minutes: 15, description: undefined })
    expect(prisma.time_entries.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ description: '' }),
    }))
  })
})

describe('getTimeEntryById', () => {
  it('fetches by id', async () => {
    prisma.time_entries.findUnique.mockResolvedValue({ id: 10 })
    const result = await getTimeEntryById(10)
    expect(prisma.time_entries.findUnique).toHaveBeenCalledWith({ where: { id: 10 } })
    expect(result.id).toBe(10)
  })
})

describe('deleteTimeEntry', () => {
  it('deletes by id', async () => {
    prisma.time_entries.delete.mockResolvedValue({ id: 10 })
    const result = await deleteTimeEntry(10)
    expect(prisma.time_entries.delete).toHaveBeenCalledWith({ where: { id: 10 } })
    expect(result.id).toBe(10)
  })
})

describe('getActiveTimer', () => {
  it('queries compound unique key', async () => {
    prisma.ticket_timers.findUnique.mockResolvedValue({ id: 5 })
    const result = await getActiveTimer(7, 3)
    expect(prisma.ticket_timers.findUnique).toHaveBeenCalledWith({
      where: { ticket_id_user_id: { ticket_id: 7, user_id: 3 } },
    })
    expect(result.id).toBe(5)
  })
})

describe('startTimer', () => {
  it('returns existing timer without creating a new one', async () => {
    prisma.ticket_timers.findUnique.mockResolvedValue({ id: 5 })
    const result = await startTimer(7, 3)
    expect(prisma.ticket_timers.create).not.toHaveBeenCalled()
    expect(result.id).toBe(5)
  })

  it('creates timer when none active', async () => {
    prisma.ticket_timers.findUnique.mockResolvedValue(null)
    prisma.ticket_timers.create.mockResolvedValue({ id: 6 })
    const result = await startTimer(7, 3)
    expect(prisma.ticket_timers.create).toHaveBeenCalledWith({
      data: { ticket_id: 7, user_id: 3, started_at: expect.any(Date) },
    })
    expect(result.id).toBe(6)
  })
})

describe('stopTimer', () => {
  it('returns null when no active timer', async () => {
    prisma.ticket_timers.findUnique.mockResolvedValue(null)
    const result = await stopTimer(7, 3)
    expect(result).toBeNull()
    expect(prisma.time_entries.create).not.toHaveBeenCalled()
  })

  it('stops timer, deletes it and creates an entry', async () => {
    const started = new Date(Date.now() - 2.5 * 60 * 1000)
    const timer = { id: 5, ticket_id: 7, user_id: 3, started_at: started }
    prisma.ticket_timers.findUnique.mockResolvedValue(timer)
    prisma.ticket_timers.delete.mockResolvedValue(timer)
    prisma.time_entries.create.mockResolvedValue({ id: 20, minutes: 3, user: { name: 'A' } })
    const result = await stopTimer(7, 3)
    expect(prisma.ticket_timers.delete).toHaveBeenCalledWith({ where: { id: 5 } })
    expect(prisma.time_entries.create).toHaveBeenCalledWith({
      data: {
        ticket_id: 7,
        user_id: 3,
        minutes: 3,
        description: '',
        entry_date: started,
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })
    expect(result.minutes).toBe(3)
    expect(result.entry.id).toBe(20)
  })

  it('ensures at least 1 minute for short sessions', async () => {
    const started = new Date(Date.now() - 10 * 1000)
    prisma.ticket_timers.findUnique.mockResolvedValue({ id: 5, started_at: started })
    prisma.ticket_timers.delete.mockResolvedValue({})
    prisma.time_entries.create.mockResolvedValue({ id: 21, minutes: 1 })
    const result = await stopTimer(7, 3)
    expect(result.minutes).toBe(1)
  })
})

describe('formatDuration', () => {
  it('splits minutes into hours and minutes', () => {
    expect(formatDuration(125)).toEqual({ hours: 2, minutes: 5 })
    expect(formatDuration(0)).toEqual({ hours: 0, minutes: 0 })
  })
})