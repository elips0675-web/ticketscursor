import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    employees: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    tickets: { count: vi.fn() },
  },
}))

import { listEmployees, getStats } from '../employees.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('listEmployees', () => {
  it('returns mapped employees with camelCase fields', async () => {
    const rows = [
      { id: 1, name: 'Alice', email: 'a@x.com', role: 'admin', department: 'IT', avatar: null, online: true, active_tickets: 3, resolved_today: 1, phone: '123' },
      { id: 2, name: 'Bob', email: 'b@x.com', role: 'agent', department: 'HR', avatar: 'pic.jpg', online: false, active_tickets: 0, resolved_today: 0, phone: null },
    ]
    prisma.employees.findMany.mockResolvedValue(rows)

    const result = await listEmployees()
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('activeTickets', 3)
    expect(result[0]).toHaveProperty('resolvedToday', 1)
    expect(result[0]).not.toHaveProperty('active_tickets')
    expect(result[1].avatar).toBe('pic.jpg')
  })

  it('filters by is_active: true', async () => {
    prisma.employees.findMany.mockResolvedValue([])
    await listEmployees()
    expect(prisma.employees.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } })
    )
  })

  it('orders by name asc', async () => {
    prisma.employees.findMany.mockResolvedValue([])
    await listEmployees()
    expect(prisma.employees.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } })
    )
  })
})

describe('getStats', () => {
  it('returns ticket stats', async () => {
    prisma.tickets.count.mockResolvedValueOnce(100)
      .mockResolvedValueOnce(40).mockResolvedValueOnce(25).mockResolvedValueOnce(30).mockResolvedValueOnce(5)

    const stats = await getStats()
    expect(stats).toEqual({ total: 100, open: 40, inProgress: 25, resolved: 30, critical: 5 })
  })

  it('returns zeros when no tickets', async () => {
    prisma.tickets.count.mockResolvedValue(0)
    const stats = await getStats()
    expect(stats.total).toBe(0)
    expect(stats.critical).toBe(0)
  })
})
