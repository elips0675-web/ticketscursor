import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    csat_surveys: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('csat.service', () => {
  let prisma

  beforeEach(async () => {
    vi.clearAllMocks()
    prisma = (await import('../../prisma.js')).default
  })

  describe('createSurvey', () => {
    it('creates a survey with a token', async () => {
      prisma.csat_surveys.create.mockResolvedValue({
        id: 1, ticket_id: 10, token: 'abc123', rating: null, comment: null,
        requester_email: 'user@test.com', sent_at: new Date(), responded_at: null, created_at: new Date(),
      })

      const { createSurvey } = await import('../../services/csat.service.js')
      const survey = await createSurvey(10, 'user@test.com')

      expect(survey.id).toBe(1)
      expect(survey.ticket_id).toBe(10)
      expect(prisma.csat_surveys.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticket_id: 10,
          requester_email: 'user@test.com',
          token: expect.stringMatching(/^[a-z0-9]{32}$/),
        }),
      })
    })

    it('handles null email', async () => {
      prisma.csat_surveys.create.mockResolvedValue({
        id: 2, ticket_id: 20, token: 'xyz789', requester_email: null,
      })

      const { createSurvey } = await import('../../services/csat.service.js')
      await createSurvey(20, null)

      expect(prisma.csat_surveys.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticket_id: 20,
          requester_email: null,
        }),
      })
    })
  })

  describe('getSurveyByToken', () => {
    it('returns survey with ticket info', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue({
        id: 1, ticket_id: 10, rating: null, comment: null, responded_at: null,
        ticket: { title: 'Login bug', status: 'open' },
      })

      const { getSurveyByToken } = await import('../../services/csat.service.js')
      const survey = await getSurveyByToken('abc123')

      expect(survey.ticket.title).toBe('Login bug')
      expect(survey.responded_at).toBeNull()
    })

    it('returns null for invalid token', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue(null)

      const { getSurveyByToken } = await import('../../services/csat.service.js')
      const survey = await getSurveyByToken('nonexistent')

      expect(survey).toBeNull()
    })
  })

  describe('submitResponse', () => {
    it('saves rating and comment', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue({ id: 1, responded_at: null })
      prisma.csat_surveys.update.mockResolvedValue({})

      const { submitResponse } = await import('../../services/csat.service.js')
      const result = await submitResponse('abc123', { rating: 5, comment: 'Great!' })

      expect(result.success).toBe(true)
      expect(prisma.csat_surveys.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { rating: 5, comment: 'Great!', responded_at: expect.any(Date) },
      })
    })

    it('rejects invalid rating', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue({ id: 1, responded_at: null })

      const { submitResponse } = await import('../../services/csat.service.js')
      await expect(submitResponse('abc123', { rating: 6, comment: '' }))
        .rejects.toThrow('Rating must be 1-5')
    })

    it('rejects rating < 1', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue({ id: 1, responded_at: null })

      const { submitResponse } = await import('../../services/csat.service.js')
      await expect(submitResponse('abc123', { rating: 0 }))
        .rejects.toThrow('Rating must be 1-5')
    })

    it('rejects already responded survey', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue({ id: 1, responded_at: new Date() })

      const { submitResponse } = await import('../../services/csat.service.js')
      await expect(submitResponse('abc123', { rating: 5 }))
        .rejects.toThrow('Survey already responded')
    })

    it('returns 404 for nonexistent token', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue(null)

      const { submitResponse } = await import('../../services/csat.service.js')
      try {
        await submitResponse('nonexistent', { rating: 5 })
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err.statusCode).toBe(404)
        expect(err.message).toBe('Survey not found')
      }
    })

    it('allows null comment', async () => {
      prisma.csat_surveys.findUnique.mockResolvedValue({ id: 1, responded_at: null })
      prisma.csat_surveys.update.mockResolvedValue({})

      const { submitResponse } = await import('../../services/csat.service.js')
      await submitResponse('abc123', { rating: 4 })

      expect(prisma.csat_surveys.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { rating: 4, comment: null, responded_at: expect.any(Date) },
      })
    })
  })

  describe('getCsatStats', () => {
    it('returns zero stats when no responses', async () => {
      prisma.csat_surveys.count.mockResolvedValue(0)

      const { getCsatStats } = await import('../../services/csat.service.js')
      const stats = await getCsatStats()

      expect(stats.total).toBe(0)
      expect(stats.average).toBe(0)
      expect(stats.responseRate).toBe(0)
    })

    it('calculates average and distribution', async () => {
      prisma.csat_surveys.count
        .mockResolvedValueOnce(10) // total responded
        .mockResolvedValueOnce(15) // total sent
      prisma.csat_surveys.groupBy.mockResolvedValue([
        { rating: 4, _count: { rating: 6 } },
        { rating: 5, _count: { rating: 4 } },
      ])

      const { getCsatStats } = await import('../../services/csat.service.js')
      const stats = await getCsatStats()

      expect(stats.total).toBe(10)
      expect(stats.average).toBe(4.4)
      expect(stats.distribution[4]).toBe(6)
      expect(stats.distribution[5]).toBe(4)
      expect(stats.responseRate).toBe(67)
    })

    it('returns all distribution keys', async () => {
      prisma.csat_surveys.count.mockResolvedValue(0)

      const { getCsatStats } = await import('../../services/csat.service.js')
      const stats = await getCsatStats()

      expect(stats.distribution).toHaveProperty('1', 0)
      expect(stats.distribution).toHaveProperty('2', 0)
      expect(stats.distribution).toHaveProperty('3', 0)
      expect(stats.distribution).toHaveProperty('4', 0)
      expect(stats.distribution).toHaveProperty('5', 0)
    })
  })

  describe('getRecentSurveys', () => {
    it('returns recent surveys with ticket title', async () => {
      prisma.csat_surveys.findMany.mockResolvedValue([
        { id: 1, ticket_id: 10, rating: 5, comment: 'OK', responded_at: new Date(), ticket: { title: 'Bug' } },
      ])

      const { getRecentSurveys } = await import('../../services/csat.service.js')
      const surveys = await getRecentSurveys(10)

      expect(surveys).toHaveLength(1)
      expect(surveys[0].ticket.title).toBe('Bug')
      expect(prisma.csat_surveys.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      )
    })

    it('returns empty array when no surveys', async () => {
      prisma.csat_surveys.findMany.mockResolvedValue([])

      const { getRecentSurveys } = await import('../../services/csat.service.js')
      const surveys = await getRecentSurveys()

      expect(surveys).toEqual([])
    })
  })
})
