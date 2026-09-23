import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    tickets: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ticket_messages: { findMany: vi.fn(), count: vi.fn() },
    employees: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    audit_log: { create: vi.fn() },
  },
}))

vi.mock('../../settings.js', () => ({ getSettings: vi.fn().mockResolvedValue({}) }))

vi.mock('../../sla.js', () => ({
  addBusinessHours: vi.fn((start, hours) => new Date(start.getTime() + hours * 3600000)),
  getRemainingBusinessMs: vi.fn(),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
}))

import prisma from '../../prisma.js'
import { getSettings } from '../../settings.js'
import {
  createTicket,
  updateTicketStatus,
  updateTicketPriority,
  updateTicketTags,
  bulkUpdateTickets,
  getSlaStats,
  listOverdueSlaTickets,
  listTickets,
  getLeastLoadedAssignee,
  generateTicketFilename,
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

  it('stores tags when provided', async () => {
    prisma.tickets.create.mockResolvedValue({ id: 1, tags: ['urgent', 'vpn'] })
    await createTicket({ title: 'T', description: 'D', priority: 'medium', category: 'support', createdBy: 1, tags: ['urgent', 'vpn'] })
    const data = prisma.tickets.create.mock.calls[0][0].data
    expect(data.tags).toEqual(['urgent', 'vpn'])
  })

  it('omits tags when not provided', async () => {
    prisma.tickets.create.mockResolvedValue({ id: 1 })
    await createTicket({ title: 'T', description: 'D', priority: 'medium', category: 'support', createdBy: 1 })
    const data = prisma.tickets.create.mock.calls[0][0].data
    expect(data).not.toHaveProperty('tags')
  })
})

describe('SLA — first_response_at', () => {
  it('sets first_response_at on status change to in_progress', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'open', first_response_at: null, resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'in_progress')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.first_response_at).toBeInstanceOf(Date)
  })

  it('does not override existing first_response_at', async () => {
    const existing = new Date(Date.now() - 86400000)
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'open', first_response_at: existing, resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'in_progress')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData).not.toHaveProperty('first_response_at')
  })

  it('throws for invalid transition', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'open', first_response_at: null, resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await expect(updateTicketStatus(1, 'resolved')).rejects.toThrow('Invalid status transition')
  })
})

describe('SLA — resolved_at', () => {
  it('sets resolved_at on status change to resolved', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'in_progress', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'resolved')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.resolved_at).toBeInstanceOf(Date)
  })

  it('clears resolved_at on reopen', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'resolved', first_response_at: new Date(), resolved_at: new Date(),
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'reopened')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.resolved_at).toBeNull()
  })
})

describe('SLA — priority change recalculates due_at', () => {
  it('updates due_at when priority changes', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      priority: 'low', category: 'support',
      sla_paused_at: null, sla_accumulated_ms: 0, created_at: new Date(),
    })
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
    expect(stats).toHaveProperty('paused')
    expect(stats).toHaveProperty('noSla')
    expect(prisma.tickets.count).toHaveBeenCalledTimes(5)
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

describe('listTickets', () => {
  it('filters by requester role', async () => {
    const mockTickets = [{ id: 1, title: 'My ticket', assigned_to_employee: null, _count: { ticket_messages: 0 } }]
    prisma.tickets.count.mockResolvedValue(1)
    prisma.tickets.findMany.mockResolvedValue(mockTickets)
    const result = await listTickets({ page: 1, limit: 20, userId: 5, role: 'requester' })
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(prisma.tickets.count).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null, created_by: 5 } }))
  })

  it('filters by agent role', async () => {
    prisma.tickets.count.mockResolvedValue(0)
    prisma.tickets.findMany.mockResolvedValue([])
    await listTickets({ page: 1, limit: 20, userId: 5, role: 'agent' })
    expect(prisma.tickets.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, OR: [{ assigned_to: 5 }, { assigned_to: null }] } }),
    )
  })

  it('does not filter for admin/super_admin', async () => {
    prisma.tickets.count.mockResolvedValue(0)
    prisma.tickets.findMany.mockResolvedValue([])
    await listTickets({ page: 1, limit: 20, userId: 1, role: 'super_admin' })
    expect(prisma.tickets.count).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null } }))
  })

  it('filters by tag', async () => {
    prisma.tickets.count.mockResolvedValue(1)
    prisma.tickets.findMany.mockResolvedValue([{ id: 1, title: 'Tagged', tags: ['urgent'], assigned_to_employee: null, _count: { ticket_messages: 0 } }])
    const result = await listTickets({ page: 1, limit: 20, userId: 1, role: 'super_admin', tags: ['urgent'] })
    expect(result.data).toHaveLength(1)
    expect(prisma.tickets.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, tags: { array_contains: 'urgent' } } }),
    )
  })
})

describe('updateTicketTags', () => {
  it('updates tags and returns them', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ id: 1 })
    prisma.tickets.update.mockResolvedValue({ id: 1, tags: ['urgent'] })
    const result = await updateTicketTags(1, ['urgent'])
    expect(result).toEqual({ id: 1, tags: ['urgent'] })
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.tags).toEqual(['urgent'])
  })

  it('stores empty array when tags cleared', async () => {
    prisma.tickets.findUnique.mockResolvedValue({ id: 1 })
    prisma.tickets.update.mockResolvedValue({ id: 1, tags: [] })
    await updateTicketTags(1, [])
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.tags).toEqual([])
  })

  it('returns null for missing ticket', async () => {
    prisma.tickets.findUnique.mockResolvedValue(null)
    const result = await updateTicketTags(999, ['x'])
    expect(result).toBeNull()
  })
})

describe('getLeastLoadedAssignee', () => {
  it('returns the least loaded agent id', async () => {
    prisma.employees.findMany.mockResolvedValue([{ id: 42 }])
    const result = await getLeastLoadedAssignee()
    expect(result).toBe(42)
  })

  it('returns null when no agents available', async () => {
    prisma.employees.findMany.mockResolvedValue([])
    const result = await getLeastLoadedAssignee()
    expect(result).toBeNull()
  })
})

describe('generateTicketFilename', () => {
  it('generates uuid-based filename', () => {
    const result = generateTicketFilename('report.pdf')
    expect(result).toMatch(/^[0-9a-f-]+-report\.pdf$/)
    expect(result.length).toBeGreaterThan('report.pdf'.length)
  })
})

describe('bulkUpdateTickets', () => {
  beforeEach(() => {
    prisma.tickets.findMany.mockResolvedValue([])
    getSettings.mockResolvedValue({})
  })

  it('returns updated 0 and skipped ids when no matching tickets', async () => {
    const result = await bulkUpdateTickets({ ids: [1, 2], action: 'status', status: 'closed' })
    expect(result).toEqual({ updated: 0, skipped: 2, results: [] })
  })

  it('closes tickets with valid transitions and skips invalid ones', async () => {
    prisma.tickets.findMany.mockResolvedValue([
      { id: 1, status: 'open', priority: 'medium', category: 'support', resolved_at: null, first_response_at: null },
      { id: 2, status: 'closed', priority: 'medium', category: 'support', resolved_at: null, first_response_at: null },
    ])
    prisma.tickets.update.mockResolvedValue({})
    const result = await bulkUpdateTickets({ ids: [1, 2], action: 'status', status: 'in_progress' })
    expect(result.updated).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.results[0]).toEqual({ id: 1, status: 'in_progress' })
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.status).toBe('in_progress')
  })

  it('reopens closed tickets', async () => {
    prisma.tickets.findMany.mockResolvedValue([
      { id: 1, status: 'closed', priority: 'medium', category: 'support', resolved_at: new Date(), first_response_at: new Date() },
      { id: 2, status: 'open', priority: 'medium', category: 'support', resolved_at: null, first_response_at: null },
    ])
    prisma.tickets.update.mockResolvedValue({})
    const result = await bulkUpdateTickets({ ids: [1, 2], action: 'status', status: 'reopened' })
    expect(result.updated).toBe(1)
    expect(result.results[0]).toEqual({ id: 1, status: 'reopened' })
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.resolved_at).toBeNull()
  })

  it('sets first_response_at on bulk status to in_progress', async () => {
    prisma.tickets.findMany.mockResolvedValue([
      { id: 1, status: 'open', priority: 'medium', category: 'support', resolved_at: null, first_response_at: null },
    ])
    prisma.tickets.update.mockResolvedValue({})
    await bulkUpdateTickets({ ids: [1], action: 'status', status: 'in_progress' })
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.first_response_at).toBeInstanceOf(Date)
  })

  it('updates priority and recalculates due_at', async () => {
    prisma.tickets.findMany.mockResolvedValue([
      { id: 1, status: 'open', priority: 'low', category: 'feature', resolved_at: null, first_response_at: null },
    ])
    prisma.tickets.update.mockResolvedValue({})
    await bulkUpdateTickets({ ids: [1], action: 'priority', priority: 'critical' })
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.priority).toBe('critical')
    expect(updateData.due_at).toBeInstanceOf(Date)
    const diffHours = (updateData.due_at.getTime() - NOW) / 3600000
    expect(diffHours).toBeLessThan(8)
    expect(diffHours).toBeGreaterThanOrEqual(4)
  })

  it('assigns tickets to employee', async () => {
    prisma.tickets.findMany.mockResolvedValue([
      { id: 1, status: 'open', priority: 'medium', category: 'support', resolved_at: null, first_response_at: null },
    ])
    prisma.employees.findUnique.mockResolvedValue({ id: 7 })
    prisma.tickets.updateMany.mockResolvedValue({ count: 1 })
    const result = await bulkUpdateTickets({ ids: [1], action: 'assign', employeeId: 7 })
    expect(result.updated).toBe(1)
    expect(prisma.tickets.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, deleted_at: null },
      data: expect.objectContaining({ assigned_to: 7 }),
    })
    expect(prisma.tickets.update).not.toHaveBeenCalled()
  })

  it('throws 404 when assigning to missing employee', async () => {
    prisma.tickets.findMany.mockResolvedValue([
      { id: 1, status: 'open', priority: 'medium', category: 'support', resolved_at: null, first_response_at: null },
    ])
    prisma.employees.findUnique.mockResolvedValue(null)
    await expect(bulkUpdateTickets({ ids: [1], action: 'assign', employeeId: 999 })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('SLA — pause on waiting_for_customer', () => {
  it('sets sla_paused_at when transitioning to waiting_for_customer', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'in_progress', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'waiting_for_customer')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.sla_paused_at).toBeInstanceOf(Date)
    expect(updateData.status).toBe('waiting_for_customer')
  })

  it('does not re-pause if already paused', async () => {
    const existingPause = new Date(Date.now() - 60000)
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'waiting_for_customer', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: existingPause, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'waiting_for_customer')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData).not.toHaveProperty('sla_paused_at')
  })
})

describe('SLA — resume from waiting_for_customer', () => {
  it('clears sla_paused_at and recalculates due_at on resume', async () => {
    const created = new Date(Date.now() - 3600000)
    const paused = new Date(Date.now() - 1800000)
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'waiting_for_customer', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: paused, sla_accumulated_ms: 0, due_at: new Date(Date.now() + 7200000),
      created_at: created, priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'in_progress')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.sla_paused_at).toBeNull()
    expect(updateData.due_at).toBeInstanceOf(Date)
    expect(updateData.status).toBe('in_progress')
  })

  it('accumulates paused time correctly across multiple pauses', async () => {
    const created = new Date(Date.now() - 7200000)
    const paused = new Date(Date.now() - 3600000)
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'waiting_for_customer', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: paused, sla_accumulated_ms: 1800000, due_at: new Date(Date.now() + 3600000),
      created_at: created, priority: 'high', category: 'bug',
    })
    await updateTicketStatus(1, 'in_progress')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.sla_accumulated_ms).toBe(1800000 + 3600000)
    expect(updateData.sla_paused_at).toBeNull()
  })
})

describe('SLA — waiting_for_customer valid transitions', () => {
  it('allows waiting_for_customer from open', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'open', first_response_at: null, resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'waiting_for_customer')
    expect(prisma.tickets.update).toHaveBeenCalled()
  })

  it('allows waiting_for_customer from reopened', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'reopened', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: null, sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'waiting_for_customer')
    expect(prisma.tickets.update).toHaveBeenCalled()
  })

  it('allows reopening from waiting_for_customer', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'waiting_for_customer', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: new Date(), sla_accumulated_ms: 1000, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await updateTicketStatus(1, 'reopened')
    const updateData = prisma.tickets.update.mock.calls[0][0].data
    expect(updateData.status).toBe('reopened')
  })

  it('rejects invalid transition: waiting_for_customer → resolved', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      status: 'waiting_for_customer', first_response_at: new Date(), resolved_at: null,
      sla_paused_at: new Date(), sla_accumulated_ms: 0, due_at: new Date(), created_at: new Date(), priority: 'medium', category: 'support',
    })
    await expect(updateTicketStatus(1, 'resolved')).rejects.toThrow('Invalid status transition')
  })
})
