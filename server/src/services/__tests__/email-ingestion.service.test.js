import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  tickets: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 100 }),
    update: vi.fn().mockResolvedValue({}),
  },
  ticket_messages: {
    create: vi.fn().mockResolvedValue({ id: 1 }),
  },
  employees: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 50 }),
  },
}))

vi.mock('../../prisma.js', () => ({ default: prismaMock }))
vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('../../email.js', () => ({ sendTicketNotification: vi.fn().mockResolvedValue({}) }))
vi.mock('../../settings.js', () => ({ getSettings: vi.fn().mockResolvedValue({}) }))

describe('email-ingestion.service', () => {
  let svc

  beforeEach(async () => {
    vi.clearAllMocks()
    svc = await import('../email-ingestion.service.js')
  })

  describe('extractTicketReference', () => {
    it('extracts ticket id from [Ticket #42]', () => {
      expect(svc.extractTicketReference('[Ticket #42] Subject line')).toBe(42)
    })

    it('extracts ticket id from [тикет #15]', () => {
      expect(svc.extractTicketReference('[тикет #15] Проблема')).toBe(15)
    })

    it('extracts without # prefix', () => {
      expect(svc.extractTicketReference('[Ticket 99] Re: Issue')).toBe(99)
    })

    it('returns null if no reference', () => {
      expect(svc.extractTicketReference('Just a subject')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(svc.extractTicketReference('')).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(svc.extractTicketReference(undefined)).toBeNull()
    })
  })

  describe('stripTicketReference', () => {
    it('removes [Ticket #42] from subject', () => {
      expect(svc.stripTicketReference('[Ticket #42] My Problem')).toBe('My Problem')
    })

    it('removes [тикет #15] from subject', () => {
      expect(svc.stripTicketReference('[тикет #15] Проблема')).toBe('Проблема')
    })

    it('returns original if no reference', () => {
      expect(svc.stripTicketReference('No reference')).toBe('No reference')
    })

    it('returns empty string for empty input', () => {
      expect(svc.stripTicketReference('')).toBe('')
    })
  })

  describe('getImapConfig', () => {
    it('returns config when settings provided', () => {
      const config = svc.getImapConfig({
        IMAP_HOST: 'imap.example.com',
        IMAP_PORT: '993',
        IMAP_USER: 'user@example.com',
        IMAP_PASS: 'secret',
      })
      expect(config).toBeTruthy()
      expect(config.host).toBe('imap.example.com')
      expect(config.auth.user).toBe('user@example.com')
    })

    it('returns null when host missing', () => {
      expect(svc.getImapConfig({ IMAP_USER: 'a', IMAP_PASS: 'b' })).toBeNull()
    })

    it('returns null when user missing', () => {
      expect(svc.getImapConfig({ IMAP_HOST: 'a', IMAP_PASS: 'b' })).toBeNull()
    })

    it('returns null when pass missing', () => {
      expect(svc.getImapConfig({ IMAP_HOST: 'a', IMAP_USER: 'b' })).toBeNull()
    })

    it('returns null when empty settings', () => {
      expect(svc.getImapConfig({})).toBeNull()
    })
  })
})
