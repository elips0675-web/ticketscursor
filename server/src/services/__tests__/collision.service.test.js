import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    tickets: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    employees: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('collision.service', () => {
  let prisma

  beforeEach(async () => {
    vi.clearAllMocks()
    prisma = (await import('../../prisma.js')).default
  })

  describe('acquireLock', () => {
    it('acquires lock when ticket has no lock', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: null, locked_at: null, deleted_at: null })
      prisma.tickets.update.mockResolvedValue({ id: 1, locked_by: 5, locked_at: new Date() })

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(1, 5)

      expect(result.success).toBe(true)
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { locked_by: 5, locked_at: expect.any(Date) },
      })
    })

    it('allows re-acquire by same user (re-entrant)', async () => {
      const lockedAt = new Date()
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 5, locked_at: lockedAt, deleted_at: null })
      prisma.tickets.update.mockResolvedValue({ id: 1, locked_by: 5, locked_at: new Date() })

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(1, 5)

      expect(result.success).toBe(true)
      expect(prisma.employees.findUnique).not.toHaveBeenCalled()
    })

    it('returns locked error with locker name for other user', async () => {
      const lockedAt = new Date(Date.now() - 1000)
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 9, locked_at: lockedAt, deleted_at: null })
      prisma.employees.findUnique.mockResolvedValue({ id: 9, name: 'Иван Петров' })

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(1, 5)

      expect(result.error).toBe('locked')
      expect(result.lockedBy).toBe('Иван Петров')
      expect(prisma.tickets.update).not.toHaveBeenCalled()
    })

    it('returns unknown locker when employee not found', async () => {
      const lockedAt = new Date(Date.now() - 1000)
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 9, locked_at: lockedAt, deleted_at: null })
      prisma.employees.findUnique.mockResolvedValue(null)

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(1, 5)

      expect(result.error).toBe('locked')
      expect(result.lockedBy).toBe('Unknown')
    })

    it('overrides expired lock (>30 min) and takes ownership', async () => {
      const oldLock = new Date(Date.now() - 31 * 60 * 1000)
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 9, locked_at: oldLock, deleted_at: null })
      prisma.tickets.update.mockResolvedValue({ id: 1, locked_by: 5, locked_at: new Date() })

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(1, 5)

      expect(result.success).toBe(true)
      expect(prisma.employees.findUnique).not.toHaveBeenCalled()
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { locked_by: 5, locked_at: expect.any(Date) },
      })
    })

    it('returns not_found for missing ticket', async () => {
      prisma.tickets.findUnique.mockResolvedValue(null)

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(999, 5)

      expect(result.error).toBe('not_found')
      expect(prisma.tickets.update).not.toHaveBeenCalled()
    })

    it('returns not_found for soft-deleted ticket', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: null, locked_at: null, deleted_at: new Date() })

      const { acquireLock } = await import('../../services/collision.service.js')
      const result = await acquireLock(1, 5)

      expect(result.error).toBe('not_found')
    })
  })

  describe('releaseLock', () => {
    it('releases lock by owner', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 5, deleted_at: null })
      prisma.tickets.update.mockResolvedValue({ id: 1, locked_by: null, locked_at: null })

      const { releaseLock } = await import('../../services/collision.service.js')
      const result = await releaseLock(1, 5)

      expect(result.success).toBe(true)
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { locked_by: null, locked_at: null },
      })
    })

    it('allows release when no one locked', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: null, deleted_at: null })
      prisma.tickets.update.mockResolvedValue({ id: 1 })

      const { releaseLock } = await import('../../services/collision.service.js')
      const result = await releaseLock(1, 5)

      expect(result.success).toBe(true)
    })

    it('rejects release by non-owner', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 9, deleted_at: null })

      const { releaseLock } = await import('../../services/collision.service.js')
      const result = await releaseLock(1, 5)

      expect(result.error).toBe('not_owner')
      expect(prisma.tickets.update).not.toHaveBeenCalled()
    })

    it('returns not_found for deleted ticket', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 5, deleted_at: new Date() })

      const { releaseLock } = await import('../../services/collision.service.js')
      const result = await releaseLock(1, 5)

      expect(result.error).toBe('not_found')
    })
  })

  describe('forceRelease', () => {
    it('clears lock regardless of owner (admin)', async () => {
      prisma.tickets.update.mockResolvedValue({ id: 1, locked_by: null, locked_at: null })

      const { forceRelease } = await import('../../services/collision.service.js')
      const result = await forceRelease(1)

      expect(result.success).toBe(true)
      expect(prisma.tickets.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { locked_by: null, locked_at: null },
      })
    })
  })

  describe('getLockStatus', () => {
    it('returns locked:false when no lock', async () => {
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: null, locked_at: null, deleted_at: null })

      const { getLockStatus } = await import('../../services/collision.service.js')
      const status = await getLockStatus(1)

      expect(status).toEqual({ locked: false })
    })

    it('returns lock details with expiresAt', async () => {
      const lockedAt = new Date()
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 9, locked_at: lockedAt, deleted_at: null })
      prisma.employees.findUnique.mockResolvedValue({ id: 9, name: 'Анна' })

      const { getLockStatus } = await import('../../services/collision.service.js')
      const status = await getLockStatus(1)

      expect(status.locked).toBe(true)
      expect(status.lockedBy).toEqual({ id: 9, name: 'Анна' })
      expect(status.lockedAt).toBe(lockedAt)
      expect(status.expiresAt.getTime()).toBe(lockedAt.getTime() + 30 * 60 * 1000)
    })

    it('returns locked:false when lock expired', async () => {
      const oldLock = new Date(Date.now() - 31 * 60 * 1000)
      prisma.tickets.findUnique.mockResolvedValue({ id: 1, locked_by: 9, locked_at: oldLock, deleted_at: null })

      const { getLockStatus } = await import('../../services/collision.service.js')
      const status = await getLockStatus(1)

      expect(status).toEqual({ locked: false })
      expect(prisma.employees.findUnique).not.toHaveBeenCalled()
    })

    it('returns null for missing/deleted ticket', async () => {
      prisma.tickets.findUnique.mockResolvedValue(null)

      const { getLockStatus } = await import('../../services/collision.service.js')
      const status = await getLockStatus(999)

      expect(status).toBeNull()
    })
  })
})