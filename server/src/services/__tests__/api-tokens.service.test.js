import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    api_tokens: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

describe('api-tokens.service', () => {
  let prisma

  beforeEach(async () => {
    vi.clearAllMocks()
    prisma = (await import('../../prisma.js')).default
  })

  describe('generateToken', () => {
    it('returns token with sd_ prefix of length 67', async () => {
      const { generateToken } = await import('../../services/api-tokens.service.js')
      const raw = generateToken()

      expect(raw.startsWith('sd_')).toBe(true)
      expect(raw.length).toBe(3 + 64)
    })

    it('generates unique tokens', async () => {
      const { generateToken } = await import('../../services/api-tokens.service.js')
      const a = generateToken()
      const b = generateToken()

      expect(a).not.toBe(b)
    })
  })

  describe('createToken', () => {
    it('stores hash and returns raw token once', async () => {
      prisma.api_tokens.create.mockResolvedValue({ id: 1, user_id: 5, name: 'CI', prefix: 'sd_abc', token_hash: 'hash' })

      const { createToken } = await import('../../services/api-tokens.service.js')
      const result = await createToken(5, 'CI', 'tickets:read', null)

      expect(result.raw).toBeTruthy()
      expect(result.raw.startsWith('sd_')).toBe(true)
      expect(prisma.api_tokens.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 5,
          name: 'CI',
          scopes: 'tickets:read',
          expires_at: null,
          token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          prefix: expect.any(String),
        }),
      })
    })

    it('accepts null scopes', async () => {
      prisma.api_tokens.create.mockResolvedValue({ id: 2 })

      const { createToken } = await import('../../services/api-tokens.service.js')
      await createToken(5, 'CI', null, null)

      expect(prisma.api_tokens.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ scopes: null }),
      })
    })

    it('passes expires_at through', async () => {
      const expires = new Date('2027-01-01')
      prisma.api_tokens.create.mockResolvedValue({ id: 3 })

      const { createToken } = await import('../../services/api-tokens.service.js')
      await createToken(5, 'CI', null, expires)

      expect(prisma.api_tokens.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ expires_at: expires }),
      })
    })
  })

  describe('validateToken', () => {
    it('returns null for token without sd_ prefix', async () => {
      const { validateToken } = await import('../../services/api-tokens.service.js')
      const result = await validateToken('not-a-token')

      expect(result).toBeNull()
      expect(prisma.api_tokens.findFirst).not.toHaveBeenCalled()
    })

    it('returns null for empty token', async () => {
      const { validateToken } = await import('../../services/api-tokens.service.js')
      expect(await validateToken('')).toBeNull()
      expect(await validateToken(null)).toBeNull()
    })

    it('returns null when token not found', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue(null)

      const { validateToken } = await import('../../services/api-tokens.service.js')
      const result = await validateToken('sd_' + 'a'.repeat(64))

      expect(result).toBeNull()
    })

    it('returns null when employee inactive', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue({
        id: 1, user_id: 5, scopes: 'tickets:read',
        employee: { id: 5, name: 'Иван', email: 'i@test.com', role: 'agent', is_active: false },
      })

      const { validateToken } = await import('../../services/api-tokens.service.js')
      const result = await validateToken('sd_' + 'a'.repeat(64))

      expect(result).toBeNull()
    })

    it('returns user info and updates last_used', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue({
        id: 7, user_id: 5, scopes: 'tickets:read,chats:read',
        employee: { id: 5, name: 'Иван', email: 'i@test.com', role: 'senior_agent', is_active: true },
      })
      prisma.api_tokens.update.mockResolvedValue({ id: 7 })

      const { validateToken } = await import('../../services/api-tokens.service.js')
      const result = await validateToken('sd_' + 'a'.repeat(64))

      expect(result).toEqual({
        userId: 5,
        name: 'Иван',
        email: 'i@test.com',
        role: 'senior_agent',
        tokenId: 7,
        scopes: ['tickets:read', 'chats:read'],
      })
      expect(prisma.api_tokens.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { last_used: expect.any(Date) },
      })
    })

    it('handles missing scopes as empty array', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue({
        id: 7, user_id: 5, scopes: null,
        employee: { id: 5, name: 'Иван', email: 'i@test.com', role: 'agent', is_active: true },
      })
      prisma.api_tokens.update.mockResolvedValue({ id: 7 })

      const { validateToken } = await import('../../services/api-tokens.service.js')
      const result = await validateToken('sd_' + 'a'.repeat(64))

      expect(result.scopes).toEqual([])
    })
  })

  describe('listTokens', () => {
    it('returns only own active tokens', async () => {
      prisma.api_tokens.findMany.mockResolvedValue([{ id: 1, name: 'CI' }])

      const { listTokens } = await import('../../services/api-tokens.service.js')
      const tokens = await listTokens(5)

      expect(tokens).toHaveLength(1)
      expect(prisma.api_tokens.findMany).toHaveBeenCalledWith({
        where: { user_id: 5, deleted_at: null },
        select: expect.objectContaining({ id: true }),
        orderBy: { created_at: 'desc' },
      })
    })
  })

  describe('deleteToken', () => {
    it('returns null for missing token', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue(null)

      const { deleteToken } = await import('../../services/api-tokens.service.js')
      expect(await deleteToken(1, 5)).toBeNull()
    })

    it('returns forbidden for other user token', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue({ id: 1, user_id: 9 })

      const { deleteToken } = await import('../../services/api-tokens.service.js')
      expect(await deleteToken(1, 5)).toBe('forbidden')
      expect(prisma.api_tokens.update).not.toHaveBeenCalled()
    })

    it('soft-deletes own token', async () => {
      prisma.api_tokens.findFirst.mockResolvedValue({ id: 1, user_id: 5 })
      prisma.api_tokens.update.mockResolvedValue({ id: 1 })

      const { deleteToken } = await import('../../services/api-tokens.service.js')
      expect(await deleteToken(1, 5)).toBe(true)
      expect(prisma.api_tokens.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deleted_at: expect.any(Date) },
      })
    })
  })
})