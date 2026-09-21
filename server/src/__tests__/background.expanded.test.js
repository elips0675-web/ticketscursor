import { describe, it, expect, vi, beforeEach } from 'vitest'

function resetPrisma() {
  prismaMock.notifications.deleteMany.mockReset().mockResolvedValue({ count: 5 })
  prismaMock.tickets.findMany.mockReset().mockResolvedValue([])
  prismaMock.employees.findMany.mockReset().mockResolvedValue([])
}
function resetLogger() {
  loggerMock.default.info.mockReset()
  loggerMock.default.warn.mockReset()
  loggerMock.default.error.mockReset()
}

const prismaMock = vi.hoisted(() => ({
  notifications: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
  tickets: { findMany: vi.fn().mockResolvedValue([]) },
  employees: { findMany: vi.fn().mockResolvedValue([]) },
  event_outbox: { create: vi.fn().mockResolvedValue({ id: 1 }), count: vi.fn().mockResolvedValue(0) },
}))
const emailMock = vi.hoisted(() => ({ sendTicketNotification: vi.fn().mockResolvedValue() }))
const notifyMock = vi.hoisted(() => ({ notifySlaBreached: vi.fn(), notifySlaEscalated: vi.fn() }))
const loggerMock = vi.hoisted(() => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
const mockQueue = vi.hoisted(() => ({ upsertJobScheduler: vi.fn().mockResolvedValue() }))
const bullMqMock = vi.hoisted(() => ({
  Queue: vi.fn(function() { return mockQueue }),
  Worker: vi.fn(function() { return {} }),
  QueueScheduler: vi.fn(function() { return {} }),
}))
const ioredisMock = vi.hoisted(() => ({ default: vi.fn() }))

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../email.js', () => emailMock)
vi.mock('../notify.js', () => notifyMock)
vi.mock('../settings.js', () => ({ getSettings: vi.fn().mockResolvedValue({ SLA_ESCALATION_ENABLED: 'false', SLA_ESCALATION_HOURS: '4', SLA_RESPONSE_HOURS: '4' }) }))
vi.mock('../logger.js', () => loggerMock)
vi.mock('bullmq', () => bullMqMock)
vi.mock('ioredis', () => ioredisMock)

describe('background.js — no Redis path', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL
    vi.resetModules()
    vi.useFakeTimers()
    resetPrisma()
    resetLogger()
    emailMock.sendTicketNotification.mockReset().mockResolvedValue()
    notifyMock.notifySlaBreached.mockReset()
    bullMqMock.Queue.mockClear()
    bullMqMock.Worker.mockClear()
    mockQueue.upsertJobScheduler.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('stopBackgroundJobs clears timers', async () => {
    const { stopBackgroundJobs, setupBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    expect(() => stopBackgroundJobs()).not.toThrow()
  })

  it('stopBackgroundJobs does not throw when called without setup', async () => {
    const { stopBackgroundJobs } = await import('../background.js')
    expect(() => stopBackgroundJobs()).not.toThrow()
  })

  it('warns admin when Redis missing', async () => {
    prismaMock.employees.findMany.mockResolvedValue([{ email: 'admin@company.ru' }])
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    expect(prismaMock.employees.findMany).toHaveBeenCalled()
    expect(emailMock.sendTicketNotification).toHaveBeenCalled()
    stopBackgroundJobs()
  })

  it('handles Redis warning email error gracefully', async () => {
    prismaMock.employees.findMany.mockRejectedValue(new Error('DB error'))
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    expect(loggerMock.default.error).toHaveBeenCalledWith('Failed to send Redis warning email:', 'DB error')
    stopBackgroundJobs()
  })

  it('runCleanup deletes old notifications', async () => {
    prismaMock.notifications.deleteMany.mockResolvedValue({ count: 3 })
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    await vi.advanceTimersByTimeAsync(6000)
    expect(prismaMock.notifications.deleteMany).toHaveBeenCalled()
    expect(loggerMock.default.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned 3'))
    stopBackgroundJobs()
  })

  it('runCleanup handles error gracefully', async () => {
    prismaMock.notifications.deleteMany.mockRejectedValue(new Error('cleanup error'))
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    await vi.advanceTimersByTimeAsync(20000)
    expect(loggerMock.default.error).toHaveBeenCalledWith(expect.stringContaining('notification-cleanup failed'), expect.stringContaining('cleanup error'))
    stopBackgroundJobs()
  })

  it('runSlaCheck checks overdue tickets', async () => {
    prismaMock.tickets.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    await vi.advanceTimersByTimeAsync(6000)
    expect(prismaMock.tickets.findMany).toHaveBeenCalled()
    expect(notifyMock.notifySlaBreached).toHaveBeenCalledTimes(2)
    expect(notifyMock.notifySlaBreached).toHaveBeenCalledWith(1)
    expect(notifyMock.notifySlaBreached).toHaveBeenCalledWith(2)
    stopBackgroundJobs()
  })

  it('runSlaCheck handles error gracefully', async () => {
    prismaMock.tickets.findMany.mockRejectedValue(new Error('sla error'))
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    await vi.advanceTimersByTimeAsync(20000)
    expect(loggerMock.default.error).toHaveBeenCalledWith(expect.stringContaining('sla-overdue-check failed'), expect.stringContaining('sla error'))
    stopBackgroundJobs()
  })
})

describe('background.js — Redis path', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    vi.resetModules()
    resetPrisma()
    resetLogger()
    bullMqMock.Queue.mockClear()
    bullMqMock.Worker.mockClear()
    mockQueue.upsertJobScheduler.mockClear()
    ioredisMock.default.mockClear()
  })

  it('sets up BullMQ when REDIS_URL is set', async () => {
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    expect(ioredisMock.default).toHaveBeenCalledWith('redis://localhost:6379', { maxRetriesPerRequest: null })
    expect(bullMqMock.Queue).toHaveBeenCalledTimes(4)
    expect(bullMqMock.Worker).toHaveBeenCalledTimes(4)
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledTimes(3)
    expect(loggerMock.default.info).toHaveBeenCalledWith('Background jobs using BullMQ (Redis) with retry + DLQ')
    expect(loggerMock.default.warn).not.toHaveBeenCalled()
    stopBackgroundJobs()
  })

  it('does not call warnAdminRedisMissing when Redis is configured', async () => {
    const { setupBackgroundJobs, stopBackgroundJobs } = await import('../background.js')
    await setupBackgroundJobs(prismaMock)
    expect(prismaMock.employees.findMany).not.toHaveBeenCalled()
    stopBackgroundJobs()
  })
})
