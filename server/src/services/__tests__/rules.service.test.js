import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    automation_rules: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tickets: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    notifications: {
      create: vi.fn(),
    },
  },
}))

vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('rules.service', () => {
  let prisma

  beforeEach(async () => {
    vi.clearAllMocks()
    prisma = (await import('../../prisma.js')).default
  })

  describe('AVAILABLE_TRIGGERS / ACTIONS', () => {
    it('exposes trigger list', async () => {
      const { AVAILABLE_TRIGGERS } = await import('../../services/rules.service.js')
      expect(AVAILABLE_TRIGGERS).toContain('ticket.created')
      expect(AVAILABLE_TRIGGERS).toContain('ticket.assigned')
      expect(AVAILABLE_TRIGGERS).toContain('ticket.closed')
    })

    it('exposes action list', async () => {
      const { AVAILABLE_ACTIONS } = await import('../../services/rules.service.js')
      expect(AVAILABLE_ACTIONS).toContain('set_priority')
      expect(AVAILABLE_ACTIONS).toContain('send_notification')
    })
  })

  describe('createRule', () => {
    it('creates rule with defaults', async () => {
      prisma.automation_rules.create.mockResolvedValue({ id: 1, name: 'Rule' })

      const { createRule } = await import('../../services/rules.service.js')
      await createRule({ name: 'Rule', triggerEvent: 'ticket.created' })

      expect(prisma.automation_rules.create).toHaveBeenCalledWith({
        data: {
          name: 'Rule',
          trigger_event: 'ticket.created',
          conditions: { logic: 'and', rules: [] },
          actions: [],
          created_by: null,
        },
      })
    })
  })

  describe('updateRule', () => {
    it('returns null for missing rule', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue(null)

      const { updateRule } = await import('../../services/rules.service.js')
      expect(await updateRule(1, { name: 'x' })).toBeNull()
    })

    it('updates given fields only', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue({ id: 1 })
      prisma.automation_rules.update.mockResolvedValue({ id: 1 })

      const { updateRule } = await import('../../services/rules.service.js')
      await updateRule(1, { name: 'New', is_active: false })

      expect(prisma.automation_rules.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'New', is_active: false },
      })
    })
  })

  describe('deleteRule', () => {
    it('soft-deletes', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue({ id: 1 })
      prisma.automation_rules.update.mockResolvedValue({ id: 1 })

      const { deleteRule } = await import('../../services/rules.service.js')
      expect(await deleteRule(1)).toBe(true)
    })

    it('returns null for missing', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue(null)

      const { deleteRule } = await import('../../services/rules.service.js')
      expect(await deleteRule(1)).toBeNull()
    })
  })

  describe('listRules', () => {
    it('lists active rules with creator', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([{ id: 1 }])

      const { listRules } = await import('../../services/rules.service.js')
      const list = await listRules()

      expect(list).toHaveLength(1)
      expect(prisma.automation_rules.findMany).toHaveBeenCalledWith({
        where: { deleted_at: null },
        include: { creator_employee: { select: { id: true, name: true } } },
        orderBy: { created_at: 'desc' },
      })
    })
  })

  describe('evaluateRules', () => {
    it('executes matched rule and increments run_count', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: JSON.stringify({ logic: 'and', rules: [{ field: 'priority', operator: 'equals', value: 'high' }] }),
          actions: JSON.stringify([{ type: 'set_status', params: { status: 'in_progress' } }]),
        },
      ])
      prisma.tickets.update.mockResolvedValue({ id: 10 })
      prisma.automation_rules.update.mockResolvedValue({ id: 1 })

      const { evaluateRules } = await import('../../services/rules.service.js')
      const executed = await evaluateRules('ticket.updated', { priority: 'high', ticketId: 10 })

      expect(executed).toBe(1)
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'in_progress' },
      })
      expect(prisma.automation_rules.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { last_run: expect.any(Date), run_count: { increment: 1 } },
      })
    })

    it('skips rule when conditions do not match', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: JSON.stringify({ logic: 'and', rules: [{ field: 'priority', operator: 'equals', value: 'low' }] }),
          actions: JSON.stringify([{ type: 'set_status', params: { status: 'in_progress' } }]),
        },
      ])

      const { evaluateRules } = await import('../../services/rules.service.js')
      const executed = await evaluateRules('ticket.updated', { priority: 'high', ticketId: 10 })

      expect(executed).toBe(0)
      expect(prisma.tickets.update).not.toHaveBeenCalled()
      expect(prisma.automation_rules.update).not.toHaveBeenCalled()
    })

    it('treats empty conditions as always true', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: JSON.stringify(null),
          actions: JSON.stringify([{ type: 'set_priority', params: { priority: 'urgent' } }]),
        },
      ])
      prisma.tickets.update.mockResolvedValue({ id: 10 })

      const { evaluateRules } = await import('../../services/rules.service.js')
      const executed = await evaluateRules('ticket.created', { ticketId: 10 })

      expect(executed).toBe(1)
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { priority: 'urgent' },
      })
    })

    it('supports OR logic', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: JSON.stringify({
            logic: 'or',
            rules: [
              { field: 'priority', operator: 'equals', value: 'high' },
              { field: 'category', operator: 'equals', value: 'bug' },
            ],
          }),
          actions: JSON.stringify([{ type: 'add_tag', params: { tag: 'important' } }]),
        },
      ])
      prisma.tickets.findUnique.mockResolvedValue({ id: 10, tags: '["old"]' })
      prisma.tickets.update.mockResolvedValue({ id: 10 })

      const { evaluateRules } = await import('../../services/rules.service.js')
      const executed = await evaluateRules('ticket.created', { category: 'bug', ticketId: 10 })

      expect(executed).toBe(1)
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { tags: expect.stringContaining('important') },
      })
    })

    it('continues when one rule throws', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: JSON.stringify({ logic: 'and', rules: [{ field: 'x', operator: 'equals', value: '1' }] }),
          actions: JSON.stringify([{ type: 'bad_action', params: {} }]),
        },
        {
          id: 2,
          conditions: null,
          actions: JSON.stringify([{ type: 'send_notification', params: { message: 'Привет {{ticketId}}' } }]),
        },
      ])
      prisma.notifications.create.mockResolvedValue({ id: 1 })
      prisma.automation_rules.update.mockResolvedValue({})

      const { evaluateRules } = await import('../../services/rules.service.js')
      const executed = await evaluateRules('ticket.created', { ticketId: 10, userId: 5 })

      expect(executed).toBe(1)
    })

    it('handles malformed rule JSON gracefully', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: '{invalid json',
          actions: '[invalid',
        },
      ])

      const { evaluateRules } = await import('../../services/rules.service.js')
      const executed = await evaluateRules('ticket.created', { ticketId: 10 })

      expect(executed).toBe(0)
    })
  })

  describe('evaluateConditions operators', () => {
    async function run(conditions) {
      prisma.automation_rules.findMany.mockResolvedValue([
        {
          id: 1,
          conditions: JSON.stringify(conditions),
          actions: JSON.stringify([{ type: 'send_notification', params: { message: 'hit' } }]),
        },
      ])
      prisma.notifications.create.mockResolvedValue({ id: 1 })
      prisma.automation_rules.update.mockResolvedValue({})
      const { evaluateRules } = await import('../../services/rules.service.js')
      return evaluateRules('ticket.created', { priority: 'medium', title: 'Принтер не работает', hours: 6, ticketId: 1, userId: 2 })
    }

    it('not_equals', async () => {
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'not_equals', value: 'high' }] })).toBe(1)
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'not_equals', value: 'medium' }] })).toBe(0)
    })

    it('contains (case-insensitive)', async () => {
      expect(await run({ logic: 'and', rules: [{ field: 'title', operator: 'contains', value: 'ПРИНТЕР' }] })).toBe(1)
      expect(await run({ logic: 'and', rules: [{ field: 'title', operator: 'contains', value: 'nonexistent' }] })).toBe(0)
    })

    it('gt / lt', async () => {
      expect(await run({ logic: 'and', rules: [{ field: 'hours', operator: 'gt', value: 5 }] })).toBe(1)
      expect(await run({ logic: 'and', rules: [{ field: 'hours', operator: 'gt', value: 10 }] })).toBe(0)
      expect(await run({ logic: 'and', rules: [{ field: 'hours', operator: 'lt', value: 10 }] })).toBe(1)
    })

    it('in / not_in', async () => {
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'in', value: ['low', 'medium'] }] })).toBe(1)
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'in', value: ['low'] }] })).toBe(0)
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'not_in', value: ['low'] }] })).toBe(1)
    })

    it('is_empty / is_not_empty', async () => {
      expect(await run({ logic: 'and', rules: [{ field: 'missing', operator: 'is_empty' }] })).toBe(1)
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'is_empty' }] })).toBe(0)
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'is_not_empty' }] })).toBe(1)
    })

    it('unknown operator returns false', async () => {
      expect(await run({ logic: 'and', rules: [{ field: 'priority', operator: 'unknown_op', value: 'x' }] })).toBe(0)
    })
  })
})