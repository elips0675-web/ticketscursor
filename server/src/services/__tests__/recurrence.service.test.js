import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('cron-parser', () => ({
  default: {
    parseExpression: vi.fn(),
  },
}))

vi.mock('../../prisma.js', () => ({
  default: {
    ticket_recurrences: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    tickets: {
      create: vi.fn(),
    },
  },
}))

vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('recurrence.service', () => {
  let prisma
  let cronParser

  beforeEach(async () => {
    vi.clearAllMocks()
    prisma = (await import('../../prisma.js')).default
    cronParser = (await import('cron-parser')).default
  })

  describe('createRecurrence', () => {
    it('creates recurrence with computed next_run', async () => {
      const nextDate = new Date('2026-10-01T09:00:00Z')
      cronParser.parseExpression.mockReturnValue({ next: () => ({ toDate: () => nextDate }) })
      prisma.ticket_recurrences.create.mockResolvedValue({ id: 1, cron_expr: '0 9 * * 1' })

      const { createRecurrence } = await import('../../services/recurrence.service.js')
      const rec = await createRecurrence({
        title: 'Weekly sync', cronExpr: '0 9 * * 1', createdBy: 3,
      })

      expect(rec.id).toBe(1)
      expect(prisma.ticket_recurrences.create).toHaveBeenCalledWith({
        data: {
          title: 'Weekly sync',
          description: null,
          priority: 'medium',
          category: 'support',
          assigned_to: null,
          cron_expr: '0 9 * * 1',
          next_run: nextDate,
          created_by: 3,
        },
      })
    })

    it('sets next_run null for invalid cron', async () => {
      cronParser.parseExpression.mockImplementation(() => { throw new Error('bad cron') })
      prisma.ticket_recurrences.create.mockResolvedValue({ id: 2 })

      const { createRecurrence } = await import('../../services/recurrence.service.js')
      await createRecurrence({ title: 'Bad', cronExpr: 'not a cron' })

      expect(prisma.ticket_recurrences.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cron_expr: 'not a cron', next_run: null }),
      })
    })

    it('passes through description, priority, category, assignedTo', async () => {
      cronParser.parseExpression.mockReturnValue({ next: () => ({ toDate: () => new Date() }) })
      prisma.ticket_recurrences.create.mockResolvedValue({ id: 3 })

      const { createRecurrence } = await import('../../services/recurrence.service.js')
      await createRecurrence({
        title: 'Sync', description: 'Описание', priority: 'high', category: 'bug', assignedTo: 8, createdBy: null,
      })

      expect(prisma.ticket_recurrences.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'Описание',
          priority: 'high',
          category: 'bug',
          assigned_to: 8,
          created_by: null,
        }),
      })
    })
  })

  describe('updateRecurrence', () => {
    it('returns null for missing recurrence', async () => {
      prisma.ticket_recurrences.findFirst.mockResolvedValue(null)

      const { updateRecurrence } = await import('../../services/recurrence.service.js')
      expect(await updateRecurrence(1, { title: 'x' })).toBeNull()
    })

    it('updates fields and recomputes next_run when cron changes', async () => {
      prisma.ticket_recurrences.findFirst.mockResolvedValue({ id: 1 })
      const nextDate = new Date('2026-11-01T08:00:00Z')
      cronParser.parseExpression.mockReturnValue({ next: () => ({ toDate: () => nextDate }) })
      prisma.ticket_recurrences.update.mockResolvedValue({ id: 1 })

      const { updateRecurrence } = await import('../../services/recurrence.service.js')
      await updateRecurrence(1, { title: 'New', priority: 'low', cron_expr: '0 8 * * 2' })

      expect(prisma.ticket_recurrences.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          title: 'New',
          priority: 'low',
          cron_expr: '0 8 * * 2',
          next_run: nextDate,
        }),
      })
    })

    it('only includes provided fields', async () => {
      prisma.ticket_recurrences.findFirst.mockResolvedValue({ id: 1 })
      prisma.ticket_recurrences.update.mockResolvedValue({ id: 1 })

      const { updateRecurrence } = await import('../../services/recurrence.service.js')
      await updateRecurrence(1, { is_active: false })

      expect(prisma.ticket_recurrences.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { is_active: false },
      })
    })
  })

  describe('deleteRecurrence', () => {
    it('soft-deletes existing recurrence', async () => {
      prisma.ticket_recurrences.findFirst.mockResolvedValue({ id: 1 })
      prisma.ticket_recurrences.update.mockResolvedValue({ id: 1 })

      const { deleteRecurrence } = await import('../../services/recurrence.service.js')
      expect(await deleteRecurrence(1)).toBe(true)
      expect(prisma.ticket_recurrences.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deleted_at: expect.any(Date) },
      })
    })

    it('returns null for missing', async () => {
      prisma.ticket_recurrences.findFirst.mockResolvedValue(null)

      const { deleteRecurrence } = await import('../../services/recurrence.service.js')
      expect(await deleteRecurrence(1)).toBeNull()
    })
  })

  describe('listRecurrences / getRecurrenceById', () => {
    it('lists active recurrences with employees ordered desc', async () => {
      prisma.ticket_recurrences.findMany.mockResolvedValue([{ id: 1 }])

      const { listRecurrences } = await import('../../services/recurrence.service.js')
      const list = await listRecurrences()

      expect(list).toHaveLength(1)
      expect(prisma.ticket_recurrences.findMany).toHaveBeenCalledWith({
        where: { deleted_at: null },
        include: {
          assigned_employee: { select: { id: true, name: true } },
          creator_employee: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
      })
    })

    it('gets recurrence by id', async () => {
      prisma.ticket_recurrences.findFirst.mockResolvedValue({ id: 1, title: 'Sync' })

      const { getRecurrenceById } = await import('../../services/recurrence.service.js')
      const rec = await getRecurrenceById(1)

      expect(rec.title).toBe('Sync')
      expect(prisma.ticket_recurrences.findFirst).toHaveBeenCalledWith({
        where: { id: 1, deleted_at: null },
        include: {
          assigned_employee: { select: { id: true, name: true } },
          creator_employee: { select: { id: true, name: true } },
        },
      })
    })
  })

  describe('processRecurrences', () => {
    it('creates tickets for due recurrences with [Плановое] prefix', async () => {
      const next = new Date('2026-12-01T09:00:00Z')
      cronParser.parseExpression.mockReturnValue({ next: () => ({ toDate: () => next }) })
      prisma.ticket_recurrences.findMany.mockResolvedValue([
        { id: 1, title: 'Backup', description: 'Ежедневный', priority: 'medium', category: 'support', assigned_to: null, created_by: 3, cron_expr: '0 9 * * *' },
      ])
      prisma.tickets.create.mockResolvedValue({ id: 101 })
      prisma.ticket_recurrences.update.mockResolvedValue({ id: 1 })

      const { processRecurrences } = await import('../../services/recurrence.service.js')
      const created = await processRecurrences()

      expect(created).toBe(1)
      expect(prisma.tickets.create).toHaveBeenCalledWith({
        data: {
          title: '[Плановое] Backup',
          description: 'Ежедневный',
          priority: 'medium',
          category: 'support',
          assigned_to: null,
          created_by: 3,
        },
      })
      expect(prisma.ticket_recurrences.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { last_run: expect.any(Date), next_run: next },
      })
    })

    it('returns 0 when no due recurrences', async () => {
      prisma.ticket_recurrences.findMany.mockResolvedValue([])

      const { processRecurrences } = await import('../../services/recurrence.service.js')
      expect(await processRecurrences()).toBe(0)
      expect(prisma.tickets.create).not.toHaveBeenCalled()
    })

    it('skips inactive recurrences (query filters them)', async () => {
      prisma.ticket_recurrences.findMany.mockResolvedValue([])

      const { processRecurrences } = await import('../../services/recurrence.service.js')
      await processRecurrences()

      expect(prisma.ticket_recurrences.findMany).toHaveBeenCalledWith({
        where: {
          is_active: true,
          deleted_at: null,
          next_run: { lte: expect.any(Date) },
        },
      })
    })

    it('continues on ticket creation failure', async () => {
      const next = new Date('2026-12-01T09:00:00Z')
      cronParser.parseExpression.mockReturnValue({ next: () => ({ toDate: () => next }) })
      prisma.ticket_recurrences.findMany.mockResolvedValue([
        { id: 1, title: 'A', description: null, priority: 'medium', category: 'support', assigned_to: null, created_by: 1, cron_expr: '0 9 * * *' },
        { id: 2, title: 'B', description: null, priority: 'low', category: 'incident', assigned_to: null, created_by: 1, cron_expr: '0 9 * * *' },
      ])
      prisma.tickets.create
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ id: 202 })
      prisma.ticket_recurrences.update.mockResolvedValue({})

      const { processRecurrences } = await import('../../services/recurrence.service.js')
      const created = await processRecurrences()

      expect(created).toBe(1)
      expect(prisma.tickets.create).toHaveBeenCalledTimes(2)
    })
  })
})