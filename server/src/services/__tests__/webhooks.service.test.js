import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    webhooks: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('webhooks.service', () => {
  let prisma

  beforeEach(async () => {
    vi.clearAllMocks()
    prisma = (await import('../../prisma.js')).default
    vi.useFakeTimers()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('AVAILABLE_EVENTS', () => {
    it('exposes 7 events', async () => {
      const { AVAILABLE_EVENTS } = await import('../../services/webhooks.service.js')
      expect(AVAILABLE_EVENTS).toHaveLength(7)
      expect(AVAILABLE_EVENTS).toContain('ticket.created')
      expect(AVAILABLE_EVENTS).toContain('employee.updated')
    })
  })

  describe('createWebhook', () => {
    it('joins events array into comma string', async () => {
      prisma.webhooks.create.mockResolvedValue({ id: 1 })

      const { createWebhook } = await import('../../services/webhooks.service.js')
      await createWebhook({ name: 'Hook', url: 'http://x', secret: 's3cr3t', events: ['ticket.created', 'ticket.closed'], createdBy: 5 })

      expect(prisma.webhooks.create).toHaveBeenCalledWith({
        data: {
          name: 'Hook',
          url: 'http://x',
          secret: 's3cr3t',
          events: 'ticket.created,ticket.closed',
          created_by: 5,
        },
      })
    })

    it('stores events string as-is', async () => {
      prisma.webhooks.create.mockResolvedValue({ id: 1 })

      const { createWebhook } = await import('../../services/webhooks.service.js')
      await createWebhook({ name: 'Hook', url: 'http://x', events: 'ticket.created' })

      expect(prisma.webhooks.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ events: 'ticket.created', secret: null, created_by: null }),
      })
    })
  })

  describe('updateWebhook', () => {
    it('returns null for missing', async () => {
      prisma.webhooks.findFirst.mockResolvedValue(null)

      const { updateWebhook } = await import('../../services/webhooks.service.js')
      expect(await updateWebhook(1, { name: 'x' })).toBeNull()
    })

    it('updates provided fields', async () => {
      prisma.webhooks.findFirst.mockResolvedValue({ id: 1 })
      prisma.webhooks.update.mockResolvedValue({ id: 1 })

      const { updateWebhook } = await import('../../services/webhooks.service.js')
      await updateWebhook(1, { name: 'New', url: 'http://y', is_active: false })

      expect(prisma.webhooks.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'New', url: 'http://y', is_active: false },
      })
    })

    it('joins events array', async () => {
      prisma.webhooks.findFirst.mockResolvedValue({ id: 1 })
      prisma.webhooks.update.mockResolvedValue({ id: 1 })

      const { updateWebhook } = await import('../../services/webhooks.service.js')
      await updateWebhook(1, { events: ['ticket.message'] })

      expect(prisma.webhooks.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { events: 'ticket.message' },
      })
    })
  })

  describe('deleteWebhook', () => {
    it('soft-deletes', async () => {
      prisma.webhooks.findFirst.mockResolvedValue({ id: 1 })
      prisma.webhooks.update.mockResolvedValue({ id: 1 })

      const { deleteWebhook } = await import('../../services/webhooks.service.js')
      expect(await deleteWebhook(1)).toBe(true)
    })

    it('returns null for missing', async () => {
      prisma.webhooks.findFirst.mockResolvedValue(null)

      const { deleteWebhook } = await import('../../services/webhooks.service.js')
      expect(await deleteWebhook(1)).toBeNull()
    })
  })

  describe('listWebhooks', () => {
    it('lists non-deleted hooks', async () => {
      prisma.webhooks.findMany.mockResolvedValue([{ id: 1 }])

      const { listWebhooks } = await import('../../services/webhooks.service.js')
      const list = await listWebhooks()

      expect(list).toHaveLength(1)
      expect(prisma.webhooks.findMany).toHaveBeenCalledWith({
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
      })
    })
  })

  describe('triggerWebhooks', () => {
    it('delivers to matching event hooks only', async () => {
      prisma.webhooks.findMany.mockResolvedValue([
        { id: 1, events: 'ticket.created', url: 'http://a', secret: null },
        { id: 2, events: 'ticket.closed', url: 'http://b', secret: null },
      ])
      global.fetch.mockResolvedValue({ ok: true, status: 200 })
      prisma.webhooks.update.mockResolvedValue({})

      const { triggerWebhooks } = await import('../../services/webhooks.service.js')
      await triggerWebhooks('ticket.created', { id: 10 })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = global.fetch.mock.calls[0]
      expect(url).toBe('http://a')
      expect(init.headers['X-Webhook-Event']).toBe('ticket.created')
      expect(init.headers['User-Agent']).toBe('ServiceDesk-Webhook/1.0')
      expect(JSON.parse(init.body).event).toBe('ticket.created')
      expect(JSON.parse(init.body).data.id).toBe(10)
      expect(prisma.webhooks.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ last_status: 200 }),
      })
    })

    it('sends HMAC signature when secret set', async () => {
      prisma.webhooks.findMany.mockResolvedValue([
        { id: 1, events: 'ticket.created', url: 'http://a', secret: 'sec' },
      ])
      global.fetch.mockResolvedValue({ ok: true, status: 200 })
      prisma.webhooks.update.mockResolvedValue({})

      const { triggerWebhooks } = await import('../../services/webhooks.service.js')
      await triggerWebhooks('ticket.created', { id: 1 })

      const init = global.fetch.mock.calls[0][1]
      expect(init.headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it('records non-ok response and retries up to MAX_RETRIES', async () => {
      prisma.webhooks.findMany.mockResolvedValue([
        { id: 1, events: 'ticket.created', url: 'http://a', secret: null },
      ])
      global.fetch.mockResolvedValue({ ok: false, status: 500 })
      prisma.webhooks.update.mockResolvedValue({})

      const { triggerWebhooks } = await import('../../services/webhooks.service.js')
      await triggerWebhooks('ticket.created', { id: 1 })

      await vi.advanceTimersByTimeAsync(0)

      expect(prisma.webhooks.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ last_status: 500, last_error: 'HTTP 500' }),
      })
      // retry scheduled via fake timer
      expect(vi.getTimerCount()).toBeGreaterThan(0)
    })

    it('records delivery failure and retries', async () => {
      prisma.webhooks.findMany.mockResolvedValue([
        { id: 1, events: 'ticket.created', url: 'http://a', secret: null },
      ])
      global.fetch.mockRejectedValue(new Error('network down'))
      prisma.webhooks.update.mockResolvedValue({})

      const { triggerWebhooks } = await import('../../services/webhooks.service.js')
      await triggerWebhooks('ticket.created', { id: 1 })

      await vi.advanceTimersByTimeAsync(0)

      expect(prisma.webhooks.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ last_status: 0, last_error: 'network down' }),
      })
      expect(vi.getTimerCount()).toBeGreaterThan(0)
    })

    it('does nothing when hook list empty', async () => {
      prisma.webhooks.findMany.mockResolvedValue([])

      const { triggerWebhooks } = await import('../../services/webhooks.service.js')
      await triggerWebhooks('ticket.created', { id: 1 })

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})