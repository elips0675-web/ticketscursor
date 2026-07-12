import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    tickets: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ticket_messages: { findMany: vi.fn(), count: vi.fn() },
    employees: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    audit_log: { create: vi.fn() },
  },
}))

vi.mock('../../settings.js', () => ({ getSettings: vi.fn().mockResolvedValue({}) }))

import prisma from '../../prisma.js'
import { getSettings } from '../../settings.js'
import {
  createTicket,
  updateTicketStatus,
  updateTicketPriority,
  getSlaStats,
  listOverdueSlaTickets,
} from '../tickets.service.js'

const NOW = Date.now()

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(NOW)
})

describe('SLA — due_at on create', () => {
  it('sets due_at based on priority and category', async () => {
    prisma.tickets.create.mockResolvedValue({ id: 1 })
    await createTicket({ title: 'Test', description: 'Desc', priority: 'critical', category: 'incident', createdBy: 1 })
    const data = prisma.tickets.create.mock.calls[0][0].data
    expect(data.due_at).toBeInstanceOf(Date)
    expect(data.due_at.getTime()).toBeGreaterThan(NOW)
  })

  it('calculates due_at: critical+incident is fastest (1h)', async () => {
    prisma.tickets.create.mockResolvedValue({ id: 1 })
    await createTicket({ title: 'T', description: 'D', priority: 'critical', category: 'incident', createdBy: 1 })
    const dueAt = prisma.tickets.create.mock.calls[0][0].data.due_at
    const diffHours = (dueAt.getTime() - NOW) / 3600000
    expect(diffHours).toBeGreaterThanOrEqual(1)
    expect(diffHours).toBeLessThan(3)
  })

  it('calculates due_at: low+feature is longest (32h)', async () => {
    prisma.tickets.create.mockResolvedValue({ id: 1 })
    await createTicket({ title: 'T', description: 'D', priority: 'low', category: 'feature', createdBy: 1 })
    const dueAt = prisma.tickets.create.mock.calls[0][0].data.due_at
    const diffHours = (dueAt.getTime() - NOW) / 3600000
    expect(diffHours).toBeGreaterThanOrEqual(30)
  })

  it('uses SLA_RESPONSE_HOURS from settings', async () => {
    getSettings.mockResolvedValue({ SLA_RESPONSE_HOURS: '8' })
    prisma.tickets.create.mockResolvedValue({ id: 1 })
    await createTicket({ title: 'T', description: 'D', priority: 'medium', category: 'support', createdBy: 1 })
    const dueAt = prisma.tickets.create.mock.calls[0][0].data.due_at
    const diffHours = (dueAt.getTime() - NOW) / 3600000
    expect(diffHours).toBeGreaterThanOrEqual(8)
  })

  it('returns null if AutoAssign disabled', async () => {
    prisma.tickets.create.mockResolvedValue({ id: 1 })
    const result = await createTicket({ title: 'T', description: 'D', priority: 'medium', category: 'support', createdBy: 1 })
    expect(result.autoAssignedTo).toBeNull()
  })
})

describe('SLA — first_response_at', () => {
  it('sets first_response_at on status change to in_progress', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ status: 'open', first_response_at: null, resolved_at: null })
    await updateTicketStatus(1, 'in_progress')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.first_response_at).toBeInstanceOf(Date)
  })

  it('does not override existing first_response_at', async () => {
    const existing = new Date(Date.now() - 86400000)
    prisma.tickets.findUnique.mockResolvedValue({ status: 'open', first_response_at: existing, resolved_at: null })
    await updateTicketStatus(1, 'in_progress')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData).not.toHaveProperty('first_response_at')
  })

  it('throws for invalid transition', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ status: 'open', first_response_at: null, resolved_at: null })
    await expect(updateTicketStatus(1, 'resolved')).rejects.toThrow('Invalid status transition')
  })
})

describe('SLA — resolved_at', () => {
  it('sets resolved_at on status change to resolved', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ status: 'in_progress', first_response_at: new Date(), resolved_at: null })
    await updateTicketStatus(1, 'resolved')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.resolved_at).toBeInstanceOf(Date)
  })

  it('clears resolved_at on reopen', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ status: 'resolved', first_response_at: new Date(), resolved_at: new Date() })
    await updateTicketStatus(1, 'reopened')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.resolved_at).toBeNull()
  })
})

describe('SLA — priority change recalculates due_at', () => {
  it('updates due_at when priority changes', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ priority: 'low', category: 'support' })
    await updateTicketPriority(1, 'critical')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.due_at).toBeInstanceOf(Date)
    expect(updateData.priority).toBe('critical')
  })
})

describe('getSlaStats', () => {
  it('returns aggregated SLA stats', async () => {
    prisma.tickets.count.mockResolvedValue(10)
    const stats = await getSlaStats()
    expect(stats).toHaveProperty('total')
    expect(stats).toHaveProperty('overdue')
    expect(stats).toHaveProperty('onTime')
    expect(stats).toHaveProperty('noSla')
    expect(prisma.tickets.count).toHaveBeenCalledTimes(4)
  })
})

describe('listOverdueSlaTickets', () => {
  it('returns overdue tickets ordered by due_at', async () => {
    prisma.tickets.findMany.mockResolvedValue([{ id: 1, title: 'Overdue', assigned_to_employee: null, ticket_messages: [], _count: { ticket_messages: 0 } }])
    const rows = await listOverdueSlaTickets(10)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
  })
})
