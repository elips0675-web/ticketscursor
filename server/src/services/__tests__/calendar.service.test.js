import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    events: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

import { listEvents, createEvent, updateEvent, deleteEvent } from '../calendar.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('listEvents', () => {
  it('returns mapped events', async () => {
    prisma.events.findMany.mockResolvedValue([
      { id: 1, title: 'Event', date: new Date(), time: '10:00', description: 'desc', creator_id: 1, created_at: new Date() },
    ])
    const result = await listEvents(2026, 7)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('creatorId', 1)
    expect(result[0]).toHaveProperty('createdAt')
    expect(result[0]).not.toHaveProperty('creator_id')
  })

  it('filters by year/month when provided', async () => {
    prisma.events.findMany.mockResolvedValue([])
    await listEvents(2026, 7)
    expect(prisma.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { date: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }) },
      })
    )
  })

  it('returns all events without date filter', async () => {
    prisma.events.findMany.mockResolvedValue([])
    await listEvents(undefined, undefined)
    expect(prisma.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })
})

describe('createEvent', () => {
  it('creates and maps event', async () => {
    prisma.events.create.mockResolvedValue({ id: 1, title: 'New', date: new Date(), time: null, description: '', creator_id: 1, created_at: new Date() })
    const result = await createEvent({ title: 'New', date: '2026-07-10', time: null, description: '', userId: 1 })
    expect(result).toHaveProperty('creatorId', 1)
  })
})

describe('updateEvent', () => {
  it('updates and returns mapped event', async () => {
    prisma.events.update.mockResolvedValue({})
    prisma.events.findUnique.mockResolvedValue({ id: 1, title: 'Updated', date: new Date(), time: '12:00', description: 'new', creator_id: 1, created_at: new Date() })
    const result = await updateEvent(1, { title: 'Updated', date: '2026-07-11', time: '12:00', description: 'new' })
    expect(result.title).toBe('Updated')
  })
})

describe('deleteEvent', () => {
  it('deletes event by id', async () => {
    prisma.events.delete.mockResolvedValue({})
    await deleteEvent(1)
    expect(prisma.events.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
