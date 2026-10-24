import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  default: {
    event_outbox: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    employees: { findMany: vi.fn() },
  },
}))

vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../email.js', () => ({ sendTicketNotification: vi.fn() }))
vi.mock('../feature-flags.js', () => ({ isFeatureEnabled: vi.fn() }))

import prisma from '../prisma.js'
import logger from '../logger.js'
import { sendTicketNotification } from '../email.js'
import { isFeatureEnabled } from '../feature-flags.js'
import { enqueueEvent } from '../outbox.js'
import {
  startOutboxWorker,
  stopOutboxWorker,
  retryDelayMs,
  MAX_ATTEMPTS,
  RETRY_BACKOFF_MS,
} from '../outbox-worker.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

describe('outbox.delivery', () => {
  let ioEmit

  beforeEach(() => {
    vi.clearAllMocks()
    stopOutboxWorker()
    ioEmit = vi.fn()
    prisma.event_outbox.findMany.mockReset().mockResolvedValue([])
    prisma.event_outbox.update.mockReset().mockResolvedValue({})
    prisma.event_outbox.create.mockReset().mockResolvedValue({ id: 1 })
    prisma.employees.findMany.mockReset().mockResolvedValue([])
    sendTicketNotification.mockReset().mockResolvedValue()
    isFeatureEnabled.mockReset().mockResolvedValue(true)
  })

  afterEach(() => {
    stopOutboxWorker()
  })

  it('enqueueEvent персистит событие с JSON payload', async () => {
    await enqueueEvent('ticket:created', 'ticket:7', { id: 7 })

    expect(prisma.event_outbox.create).toHaveBeenCalledWith({
      data: {
        event_type: 'ticket:created',
        room: 'ticket:7',
        payload: JSON.stringify({ id: 7 }),
      },
    })
  })

  it('успешная доставка → sent_at и status sent', async () => {
    const row = { id: 1, event_type: 'ticket:created', room: null, payload: JSON.stringify({ ticketId: 7 }) }
    prisma.event_outbox.findMany.mockResolvedValueOnce([row]).mockResolvedValue([])
    const io = { emit: ioEmit, to: () => ({ emit: ioEmit }) }
    startOutboxWorker(() => io)

    await wait(200)

    expect(ioEmit).toHaveBeenCalledWith('ticket:created', { ticketId: 7 })
    expect(prisma.event_outbox.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        sent_at: expect.any(Date),
        status: 'sent',
        last_error: null,
        next_attempt_at: null,
      },
    })
  })

  it('сбой отправки → retrying с backoff 1 минута, без мгновенного повтора', async () => {
    const row = { id: 2, attempts: 0, event_type: 'chat:message', room: 'chat:5', payload: JSON.stringify({ text: 'hi' }) }
    prisma.event_outbox.findMany.mockResolvedValueOnce([row]).mockResolvedValue([])
    ioEmit.mockImplementationOnce(() => { throw new Error('socket dead') })
    const io = { emit: ioEmit, to: () => ({ emit: ioEmit }) }
    startOutboxWorker(() => io)

    await wait(250)

    expect(ioEmit).toHaveBeenCalledTimes(1)
    expect(prisma.event_outbox.update).toHaveBeenCalledTimes(1)
    const data = prisma.event_outbox.update.mock.calls[0][0].data
    expect(data).toMatchObject({ attempts: 1, status: 'retrying', last_error: 'socket dead' })
    const delay = data.next_attempt_at.getTime() - Date.now()
    expect(delay).toBeGreaterThan(55_000)
    expect(delay).toBeLessThanOrEqual(60_000)
    expect(logger.warn).toHaveBeenCalledWith(
      'Outbox event scheduled for retry',
      expect.objectContaining({ eventId: 2, attempts: 1 }),
    )
  })

  it('третья ошибка → status failed и алерт админам', async () => {
    const row = { id: 3, attempts: 2, event_type: 'ticket:created', room: null, payload: '{}' }
    prisma.event_outbox.findMany.mockResolvedValueOnce([row]).mockResolvedValue([])
    prisma.employees.findMany.mockResolvedValue([{ email: 'admin@test.com' }, { email: null }])
    ioEmit.mockImplementationOnce(() => { throw new Error('boom') })
    const io = { emit: ioEmit, to: () => ({ emit: ioEmit }) }
    startOutboxWorker(() => io)

    await wait(250)

    expect(prisma.event_outbox.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { attempts: MAX_ATTEMPTS, status: 'failed', last_error: 'boom', next_attempt_at: null },
    })
    expect(sendTicketNotification).toHaveBeenCalledTimes(1)
    expect(sendTicketNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@test.com',
      subject: expect.stringContaining('ticket:created'),
    }))
    expect(logger.error).toHaveBeenCalledWith(
      'Outbox event failed permanently',
      expect.objectContaining({ eventId: 3, attempts: MAX_ATTEMPTS }),
    )
  })

  it('алерт упал → failed всё равно фиксируется, ошибка не пробрасывается', async () => {
    const row = { id: 4, attempts: 2, event_type: 'ticket:created', room: null, payload: '{}' }
    prisma.event_outbox.findMany.mockResolvedValueOnce([row]).mockResolvedValue([])
    prisma.employees.findMany.mockRejectedValue(new Error('db down'))
    ioEmit.mockImplementationOnce(() => { throw new Error('boom') })
    startOutboxWorker(() => ({ emit: ioEmit, to: () => ({ emit: ioEmit }) }))

    await wait(250)

    expect(prisma.event_outbox.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 4 },
      data: expect.objectContaining({ status: 'failed' }),
    }))
    expect(logger.error).toHaveBeenCalledWith('Outbox alert failed:', 'db down')
  })

  it('флаг outbox_retry выключен → прежнее поведение: только лог, строка не меняется', async () => {
    isFeatureEnabled.mockResolvedValue(false)
    const row = { id: 5, attempts: 0, event_type: 'ticket:updated', room: null, payload: '{}' }
    prisma.event_outbox.findMany.mockResolvedValue([row])
    ioEmit.mockImplementation(() => { throw new Error('socket dead') })
    startOutboxWorker(() => ({ emit: ioEmit, to: () => ({ emit: ioEmit }) }))

    await wait(250)

    expect(ioEmit.mock.calls.length).toBeGreaterThan(1)
    expect(prisma.event_outbox.update).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      'Outbox worker send error:',
      expect.objectContaining({ eventId: 5, error: 'socket dead' }),
    )
  })

  it('флаг включён → выборка ждёт next_attempt_at', async () => {
    startOutboxWorker(() => ({ emit: ioEmit, to: () => ({ emit: ioEmit }) }))

    await wait(50)

    const where = prisma.event_outbox.findMany.mock.calls[0][0].where
    expect(where.status).toEqual({ in: ['pending', 'retrying'] })
    expect(where.OR).toEqual([
      { next_attempt_at: null },
      { next_attempt_at: { lte: expect.any(Date) } },
    ])
  })

  it('флаг выключен → выборка без OR, retrying не ждёт backoff', async () => {
    isFeatureEnabled.mockResolvedValue(false)
    startOutboxWorker(() => ({ emit: ioEmit, to: () => ({ emit: ioEmit }) }))

    await wait(50)

    const where = prisma.event_outbox.findMany.mock.calls[0][0].where
    expect(where.status).toEqual({ in: ['pending', 'retrying'] })
    expect(where.OR).toBeUndefined()
  })

  it('Socket.IO недоступен → row НЕ помечается (retry позже)', async () => {
    const row = { id: 6, event_type: 'ticket:updated', room: null, payload: '{"id":9}' }
    prisma.event_outbox.findMany.mockResolvedValue([row])
    startOutboxWorker(() => null)

    await wait(250)

    expect(ioEmit).not.toHaveBeenCalled()
    expect(prisma.event_outbox.update).not.toHaveBeenCalled()
  })

  it('retryDelayMs: 1м / 5м / 15м и потолок на 15м', () => {
    expect(RETRY_BACKOFF_MS).toEqual([60_000, 300_000, 900_000])
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(2)).toBe(300_000)
    expect(retryDelayMs(3)).toBe(900_000)
    expect(retryDelayMs(4)).toBe(900_000)
    expect(retryDelayMs(0)).toBe(60_000)
  })
})
