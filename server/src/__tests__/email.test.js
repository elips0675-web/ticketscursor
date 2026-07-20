import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

vi.mock('../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn() } }))

describe('email.js', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_PORT
    delete process.env.SMTP_SECURE
    delete process.env.SMTP_FROM
  })

  it('skips sending when SMTP not configured', async () => {
    const { sendTicketNotification } = await import('../email.js')
    const result = await sendTicketNotification({ to: 'test@test.com', subject: 'Test', text: 'Body' })
    expect(result).toBeUndefined()
  })

  it('sends email when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_USER = 'user@test.com'
    process.env.SMTP_PASS = 'pass'

    const nodemailer = await import('nodemailer')
    const sendMail = vi.fn().mockResolvedValue({ accepted: ['test@test.com'] })
    nodemailer.default.createTransport.mockReturnValue({ sendMail })

    const { sendTicketNotification } = await import('../email.js')
    await sendTicketNotification({ to: 'test@test.com', subject: 'Hello', text: 'World' })

    expect(nodemailer.default.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      secure: false,
      auth: { user: 'user@test.com', pass: 'pass' },
    })
    expect(sendMail).toHaveBeenCalledWith({
      from: 'user@test.com',
      to: 'test@test.com',
      subject: 'Hello',
      text: 'World',
    })
  })

  it('uses SMTP_FROM when provided', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_USER = 'user@test.com'
    process.env.SMTP_PASS = 'pass'
    process.env.SMTP_FROM = 'noreply@company.ru'

    const nodemailer = await import('nodemailer')
    const sendMail = vi.fn().mockResolvedValue({})
    nodemailer.default.createTransport.mockReturnValue({ sendMail })

    const { sendTicketNotification } = await import('../email.js')
    await sendTicketNotification({ to: 'admin@company.ru', subject: 'SLA', text: 'Overdue' })

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'noreply@company.ru',
    }))
  })

  it('handles send error gracefully', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_USER = 'user@test.com'
    process.env.SMTP_PASS = 'pass'

    const nodemailer = await import('nodemailer')
    const logger = await import('../logger.js')
    nodemailer.default.createTransport.mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP error')),
    })

    const { sendTicketNotification } = await import('../email.js')
    await expect(sendTicketNotification({ to: 'x@x.com', subject: 'T', text: 'B' }))
      .resolves.toBeUndefined()
    expect(logger.default.error).toHaveBeenCalled()
  })

  it('uses custom SMTP_PORT and secure', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_USER = 'user@test.com'
    process.env.SMTP_PASS = 'pass'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_SECURE = 'true'

    const nodemailer = await import('nodemailer')
    const sendMail = vi.fn().mockResolvedValue({})
    nodemailer.default.createTransport.mockReturnValue({ sendMail })

    const { sendTicketNotification } = await import('../email.js')
    await sendTicketNotification({ to: 'a@b.com', subject: 'S', text: 'B' })

    expect(nodemailer.default.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 465,
      secure: true,
    }))
  })
})
