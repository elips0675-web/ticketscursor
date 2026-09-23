import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  default: {
    event_outbox: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import prisma from '../prisma.js'
import { enqueueEvent } from '../outbox.js'
import { startOutboxWorker, stopOutboxWorker } from '../outbox-worker.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

describe('outbox.delivery', () => {
  let ioEmit

  beforeEach(() => {
    vi.clearAllMocks()
    stopOutboxWorker()
    ioEmit = vi.fn()
  })

  afterEach(() => {
    stopOutboxWorker()
  })

  it('enqueueEvent персистит событие с JSON payload', async () => {
    prisma.event_outbox.create.mockResolvedValue({ id: 1 })

    await enqueueEvent('ticket:created', 'ticket:7', { id: 7 })

    expect(prisma.event_outbox.create).toHaveBeenCalledWith({
      data: {
        event_type: 'ticket:created',
        room: 'ticket:7',
        payload: JSON.stringify({ id: 7 }),
      },
    })
  })

  it('enqueue → воркер → событие доставлено и row помечена sent_at', async () => {
    const row = { id: 1, event_type: 'ticket:created', room: null, payload: JSON.stringify({ ticketId: 7 }) }
    prisma.event_outbox.findMany.mockResolvedValueOnce([row]).mockResolvedValue([])
    const io = { emit: ioEmit, to: () => ({ emit: ioEmit }) }
    startOutboxWorker(() => io)

    await wait(200)

    expect(ioEmit).toHaveBeenCalledWith('ticket:created', { ticketId: 7 })
    expect(prisma.event_outbox.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sent_at: expect.any(Date) },
    })
  })

  it('сбой отправки → row НЕ помечается, воркер ретраит и доставляет', async () => {
    const row = { id: 2, event_type: 'chat:message', room: 'chat:5', payload: JSON.stringify({ text: 'hi' }) }
    prisma.event_outbox.findMany
      .mockResolvedValueOnce([row]) // poll 1: emit падает
      .mockResolvedValueOnce([row]) // poll 2: emit ок
      .mockResolvedValue([])
    ioEmit.mockImplementationOnce(() => { throw new Error('socket dead') })
    const io = { emit: ioEmit, to: () => ({ emit: ioEmit }) }
    startOutboxWorker(() => io)

    await wait(350)

    expect(ioEmit).toHaveBeenCalledTimes(2) // первая попытка упала, вторая доставила
    expect(prisma.event_outbox.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { sent_at: expect.any(Date) },
    })
  })

  it('Socket.IO недоступен → row НЕ помечается (retry позже)', async () => {
    const row = { id: 3, event_type: 'ticket:updated', room: null, payload: '{"id":9}' }
    prisma.event_outbox.findMany.mockResolvedValue([row])
    startOutboxWorker(() => null)

    await wait(250)

    expect(ioEmit).not.toHaveBeenCalled()
    expect(prisma.event_outbox.update).not.toHaveBeenCalled()
  })
})