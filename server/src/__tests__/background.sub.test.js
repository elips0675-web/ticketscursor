import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  notifications: { deleteMany: vi.fn() },
  tickets: { findMany: vi.fn(), updateMany: vi.fn() },
  employees: { findMany: vi.fn() },
  event_outbox: { count: vi.fn(), create: vi.fn() },
}))
const emailMock = vi.hoisted(() => ({ sendTicketNotification: vi.fn() }))
const notifyMock = vi.hoisted(() => ({ notifySlaBreached: vi.fn(), notifySlaEscalated: vi.fn() }))
const loggerMock = vi.hoisted(() => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../email.js', () => emailMock)
vi.mock('../notify.js', () => notifyMock)
vi.mock('../settings.js', () => ({ getSettings: vi.fn().mockResolvedValue({ SLA_ESCALATION_ENABLED: 'true', SLA_ESCALATION_HOURS: '4', SLA_RESPONSE_HOURS: '4' }) }))
vi.mock('../logger.js', () => loggerMock)
vi.mock('../services/recurrence.service.js', () => ({ processRecurrences: vi.fn().mockResolvedValue() }))

const NOW = new Date('2026-09-24T12:00:00Z')
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000)

describe('background — sub-тесты resilience (SLA-эскалация, cleanup, DLQ, IMAP)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    prismaMock.notifications.deleteMany.mockReset().mockResolvedValue({ count: 0 })
    prismaMock.tickets.findMany.mockReset().mockResolvedValue([])
    prismaMock.tickets.updateMany.mockReset().mockResolvedValue({ count: 1 })
    prismaMock.employees.findMany.mockReset().mockResolvedValue([])
    prismaMock.event_outbox.count.mockReset().mockResolvedValue(0)
    prismaMock.event_outbox.create.mockReset().mockResolvedValue({ id: 1 })
    emailMock.sendTicketNotification.mockReset().mockResolvedValue()
    notifyMock.notifySlaBreached.mockReset()
    notifyMock.notifySlaEscalated.mockReset()
    loggerMock.default.info.mockReset()
    loggerMock.default.warn.mockReset()
    loggerMock.default.error.mockReset()
  })

  afterEach(() => { vi.useRealTimers() })

  it('runSlaCheck — эскалация level 1 при hoursOverdue >= hours × level', async () => {
    prismaMock.tickets.findMany.mockResolvedValue([
      { id: 1, priority: 'medium', due_at: hoursAgo(5), escalation_level: 0, escalated_at: null },
    ])
    const { runSlaCheck } = await import('../background.js')
    await runSlaCheck(prismaMock)
    expect(prismaMock.tickets.updateMany).toHaveBeenCalledWith({
      where: { id: 1, escalation_level: 0 },
      data: expect.objectContaining({ priority: 'high', escalation_level: 1 }),
    })
    expect(notifyMock.notifySlaEscalated).toHaveBeenCalledWith(1, 'medium', 'high', 1)
  })

  it('runSlaCheck — эскалация level 2 при >2× часов (по интервалам)', async () => {
    prismaMock.tickets.findMany.mockResolvedValue([
      { id: 2, priority: 'low', due_at: hoursAgo(9), escalation_level: 1, escalated_at: null },
    ])
    const { runSlaCheck } = await import('../background.js')
    await runSlaCheck(prismaMock)
    expect(prismaMock.tickets.updateMany).toHaveBeenCalledWith({
      where: { id: 2, escalation_level: 1 },
      data: expect.objectContaining({ priority: 'medium', escalation_level: 2 }),
    })
  })

  it('runSlaCheck — updateMany count 0 → без notify (защита от двойной эскалации)', async () => {
    prismaMock.tickets.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.tickets.findMany.mockResolvedValue([
      { id: 3, priority: 'medium', due_at: hoursAgo(5), escalation_level: 0, escalated_at: null },
    ])
    const { runSlaCheck } = await import('../background.js')
    await runSlaCheck(prismaMock)
    expect(notifyMock.notifySlaEscalated).not.toHaveBeenCalled()
  })

  it('runSlaCheck — critical: эскалация без повышения приоритета', async () => {
    prismaMock.tickets.findMany.mockResolvedValue([
      { id: 4, priority: 'critical', due_at: hoursAgo(5), escalation_level: 0, escalated_at: null },
    ])
    const { runSlaCheck } = await import('../background.js')
    await runSlaCheck(prismaMock)
    const call = prismaMock.tickets.updateMany.mock.calls[0][0]
    expect(call.data.escalation_level).toBe(1)
    expect(call.data.priority).toBeUndefined()
    expect(notifyMock.notifySlaEscalated).not.toHaveBeenCalled()
  })

  it('runCleanup — удаляет уведомления старше 90 дней', async () => {
    let where = null
    prismaMock.notifications.deleteMany.mockImplementation(async (args) => { where = args.where; return { count: 3 } })
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    await vi.advanceTimersByTimeAsync(6000)
    expect(prismaMock.notifications.deleteMany).toHaveBeenCalled()
    // runCleanup выполняется на таймере t+5000, поэтому cutoff сдвинут на ≤5с
    const cutoffMs = where.created_at.lt.getTime()
    const expectedMs = NOW.getTime() - 90 * 24 * 3600 * 1000
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThanOrEqual(6000)
    expect(loggerMock.default.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned 3'))
    stopBackgroundJobs()
  })

  it('checkDlqAlert — больше порога (10) → письмо админам', async () => {
    prismaMock.event_outbox.count.mockResolvedValue(15)
    prismaMock.employees.findMany.mockResolvedValue([{ email: 'admin@test.ru' }])
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    await vi.advanceTimersByTimeAsync(31000)
    expect(emailMock.sendTicketNotification).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('DLQ alert') }),
    )
    stopBackgroundJobs()
  })

  it('checkDlqAlert — ≤ порога → письма нет', async () => {
    prismaMock.event_outbox.count.mockResolvedValue(5)
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    const before = emailMock.sendTicketNotification.mock.calls.length
    await vi.advanceTimersByTimeAsync(31000)
    expect(emailMock.sendTicketNotification.mock.calls.length).toBe(before)
    stopBackgroundJobs()
  })

  it('stopImapPolling без запуска — не падает', async () => {
    const { stopImapPolling } = await import('../services/email-ingestion.service.js')
    expect(() => stopImapPolling()).not.toThrow()
  })
})