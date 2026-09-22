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

const imapFlowMock = vi.hoisted(() => {
  const setFlags = vi.fn().mockResolvedValue(undefined)
  const logout = vi.fn().mockResolvedValue(undefined)
  const getMailboxLock = vi.fn().mockResolvedValue({ release: vi.fn() })
  const fetch = vi.fn().mockReturnValue((async function* () {})())
  const connect = vi.fn().mockResolvedValue(undefined)
  const FakeImapFlow = vi.fn(function () {
    return {
      connect,
      logout,
      getMailboxLock,
      fetch,
      setFlags,
    }
  })
  return { FakeImapFlow, connect, logout, getMailboxLock, fetch, setFlags }
})

const simpleParserMock = vi.hoisted(() => vi.fn())

vi.mock('../../prisma.js', () => ({ default: prismaMock }))
vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('../../email.js', () => ({ sendTicketNotification: vi.fn().mockResolvedValue({}) }))
vi.mock('../../settings.js', () => ({ getSettings: vi.fn().mockResolvedValue({}) }))
vi.mock('imapflow', () => ({ ImapFlow: imapFlowMock.FakeImapFlow }))
vi.mock('mailparser', () => ({ simpleParser: simpleParserMock }))

import { getSettings } from '../../settings.js'

describe('email-ingestion.service', () => {
  let svc
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.doMock('../../logger.js', () => ({ default: logger }))
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
      expect(config.secure).toBe(true)
    })
    it('falls back to env and non-secure port', () => {
      process.env.IMAP_HOST = 'imap.env.com'
      process.env.IMAP_PORT = '143'
      process.env.IMAP_USER = 'env-user'
      process.env.IMAP_PASS = 'env-pass'
      try {
        const config = svc.getImapConfig({})
        expect(config.host).toBe('imap.env.com')
        expect(config.port).toBe(143)
        expect(config.secure).toBe(false)
      } finally {
        delete process.env.IMAP_HOST
        delete process.env.IMAP_PORT
        delete process.env.IMAP_USER
        delete process.env.IMAP_PASS
      }
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

  describe('getEmailStats', () => {
    it('returns not configured when no settings', async () => {
      getSettings.mockResolvedValueOnce({})
      const stats = await svc.getEmailStats()
      expect(stats.configured).toBe(false)
      expect(stats.polling).toBe(false)
      expect(stats.imapHost).toBeNull()
    })

    it('returns configured with host', async () => {
      getSettings.mockResolvedValueOnce({ IMAP_HOST: 'imap.x.com', IMAP_USER: 'u', IMAP_PASS: 'p' })
      const stats = await svc.getEmailStats()
      expect(stats.configured).toBe(true)
      expect(stats.imapHost).toBe('imap.x.com')
    })

    it('tolerates settings error', async () => {
      getSettings.mockRejectedValueOnce(new Error('settings down'))
      const stats = await svc.getEmailStats()
      expect(stats.configured).toBe(false)
    })
  })

  describe('testImapConnection', () => {
    it('throws when IMAP not configured', async () => {
      getSettings.mockResolvedValueOnce({})
      await expect(svc.testImapConnection()).rejects.toThrow('IMAP not configured')
    })

    it('returns success on connect', async () => {
      getSettings.mockResolvedValueOnce({ IMAP_HOST: 'imap.x.com', IMAP_USER: 'u', IMAP_PASS: 'p' })
      const result = await svc.testImapConnection()
      expect(result).toEqual({ success: true, message: 'Connected successfully' })
    })

    it('throws on connect failure', async () => {
      getSettings.mockResolvedValueOnce({ IMAP_HOST: 'imap.x.com', IMAP_USER: 'u', IMAP_PASS: 'p' })
      imapFlowMock.connect.mockRejectedValueOnce(new Error('refused'))
      await expect(svc.testImapConnection()).rejects.toThrow('Connection failed')
    })
  })

  describe('pollOnce (via startImapPolling)', () => {
    it('does not start when no IMAP config', async () => {
      getSettings.mockResolvedValueOnce({})
      svc.startImapPolling()
      await Promise.resolve()
      await Promise.resolve()
      expect(logger.info).toHaveBeenCalledWith('IMAP polling not started (no IMAP config)')
      svc.stopImapPolling()
    })

    it('starts polling with config and processes emails', async () => {
      getSettings.mockResolvedValue({
        IMAP_HOST: 'imap.x.com',
        IMAP_USER: 'u',
        IMAP_PASS: 'p',
      })
      // письмо-ответ с inReplyTo -> сервис находит существующий тикет
      prismaMock.tickets.findFirst.mockResolvedValueOnce({ id: 42 })
      imapFlowMock.fetch.mockReturnValueOnce(
        (async function* () {
          yield { uid: 5, source: Buffer.from('raw email') }
        })(),
      )
      simpleParserMock.mockResolvedValueOnce({
        from: { text: 'client@example.com', value: [{ name: 'Client' }] },
        subject: '[Ticket #42] Re: my issue',
        text: 'Reply body text',
        messageId: 'msg-1',
        inReplyTo: 'msg-0',
      })

      svc.startImapPolling()
      await new Promise((r) => setTimeout(r, 10))
      // pollOnce runs async after startImapPolling; give it a tick
      await Promise.resolve()
      expect(prismaMock.ticket_messages.create).toHaveBeenCalled()
      expect(imapFlowMock.setFlags).toHaveBeenCalled()
      svc.stopImapPolling()
    })

    it('creates new ticket when no reference found', async () => {
      getSettings.mockResolvedValue({
        IMAP_HOST: 'imap.x.com',
        IMAP_USER: 'u',
        IMAP_PASS: 'p',
      })
      imapFlowMock.fetch.mockReturnValueOnce(
        (async function* () {
          yield { uid: 6, source: Buffer.from('raw email 2') }
        })(),
      )
      simpleParserMock.mockResolvedValueOnce({
        from: { text: 'new@example.com', value: [{ name: 'New' }] },
        subject: 'Brand new issue',
        text: 'body text',
        messageId: 'msg-new',
        inReplyTo: null,
      })

      svc.startImapPolling()
      await new Promise((r) => setTimeout(r, 10))
      await Promise.resolve()
      expect(prismaMock.employees.create).toHaveBeenCalled()
      expect(prismaMock.tickets.create).toHaveBeenCalled()
      svc.stopImapPolling()
    })

    it('handles empty email skip', async () => {
      getSettings.mockResolvedValue({
        IMAP_HOST: 'imap.x.com',
        IMAP_USER: 'u',
        IMAP_PASS: 'p',
      })
      imapFlowMock.fetch.mockReturnValueOnce(
        (async function* () {
          yield { uid: 7, source: Buffer.from('empty') }
        })(),
      )
      simpleParserMock.mockResolvedValueOnce({
        from: { text: '', value: [] },
        subject: '',
        text: '',
      })

      svc.startImapPolling()
      await new Promise((r) => setTimeout(r, 10))
      expect(logger.warn).toHaveBeenCalledWith('IMAP: empty email, skipping')
      svc.stopImapPolling()
    })

    it('logs error when connection fails', async () => {
      getSettings.mockResolvedValue({
        IMAP_HOST: 'imap.x.com',
        IMAP_USER: 'u',
        IMAP_PASS: 'p',
      })
      imapFlowMock.connect.mockRejectedValueOnce(new Error('connect refused'))
      svc.startImapPolling()
      await new Promise((r) => setTimeout(r, 10))
      expect(logger.error).toHaveBeenCalledWith('IMAP connection error:', 'connect refused')
      svc.stopImapPolling()
    })
  })

  describe('stopImapPolling', () => {
    it('is idempotent when not started', () => {
      expect(() => svc.stopImapPolling()).not.toThrow()
    })
  })
})