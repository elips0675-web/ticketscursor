import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = vi.hoisted(() => ({
  telegram_updates: { create: vi.fn() },
}))
vi.mock('../prisma.js', () => ({ default: prismaMock }))

const telegramMock = vi.hoisted(() => ({ handleTelegramUpdate: vi.fn() }))
vi.mock('../telegram.js', () => telegramMock)

vi.mock('../logger.js', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import router from '../routes/telegram-webhook.js'

const app = express()
app.use(express.json())
app.use('/api/webhooks/telegram', router)

const SECRET = 'test-webhook-secret'
const HEADER = 'x-telegram-bot-api-secret-token'

function post(body, headers = {}) {
  let req = request(app).post('/api/webhooks/telegram')
  for (const [key, value] of Object.entries(headers)) req = req.set(key, value)
  return req.send(body)
}

function validUpdate(overrides = {}) {
  return {
    update_id: 1001,
    message: { chat: { id: 42 }, from: { id: 7 }, text: '/start' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
  prismaMock.telegram_updates.create.mockResolvedValue({ id: 1 })
  telegramMock.handleTelegramUpdate.mockResolvedValue({ ok: true })
})

afterEach(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET
})

describe('POST /api/webhooks/telegram — секрет и валидация', () => {
  it('без TELEGRAM_WEBHOOK_SECRET отвечает 503 (fail-closed)', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    const res = await post(validUpdate(), { [HEADER]: SECRET })
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
    expect(prismaMock.telegram_updates.create).not.toHaveBeenCalled()
  })

  it('без заголовка secret_token отвечает 401', async () => {
    const res = await post(validUpdate())
    expect(res.status).toBe(401)
    expect(telegramMock.handleTelegramUpdate).not.toHaveBeenCalled()
  })

  it('неверный secret_token отвечает 401', async () => {
    const res = await post(validUpdate(), { [HEADER]: 'wrong-secret' })
    expect(res.status).toBe(401)
  })

  it('secret_token другой длины отвечает 401 без падения timingSafeEqual', async () => {
    const res = await post(validUpdate(), { [HEADER]: `${SECRET}-longer` })
    expect(res.status).toBe(401)
  })

  it('тело без update_id отвечает 400', async () => {
    const res = await post({ message: { chat: { id: 1 } } }, { [HEADER]: SECRET })
    expect(res.status).toBe(400)
    expect(prismaMock.telegram_updates.create).not.toHaveBeenCalled()
  })

  it('update без message и callback_query отвечает 400', async () => {
    const res = await post({ update_id: 5 }, { [HEADER]: SECRET })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/webhooks/telegram — обработка и дедупликация', () => {
  it('валидный update сохраняется и передаётся обработчику', async () => {
    const res = await post(validUpdate(), { [HEADER]: SECRET })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prismaMock.telegram_updates.create).toHaveBeenCalledWith({
      data: { update_id: 1001n, kind: 'message' },
    })
    expect(telegramMock.handleTelegramUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ update_id: 1001, message: expect.objectContaining({ text: '/start' }) }),
    )
  })

  it('callback_query помечается kind=callback_query', async () => {
    const res = await post(
      { update_id: 1002, callback_query: { id: 'q1', data: 'ticket_3', message: { chat: { id: 9 } } } },
      { [HEADER]: SECRET },
    )
    expect(res.status).toBe(200)
    expect(prismaMock.telegram_updates.create).toHaveBeenCalledWith({
      data: { update_id: 1002n, kind: 'callback_query' },
    })
  })

  it('повторный update_id (P2002) — 200 duplicate, обработчик не вызывается', async () => {
    prismaMock.telegram_updates.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    )
    const res = await post(validUpdate(), { [HEADER]: SECRET })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, duplicate: true })
    expect(telegramMock.handleTelegramUpdate).not.toHaveBeenCalled()
  })

  it('ошибка БД при дедупликации — 500', async () => {
    prismaMock.telegram_updates.create.mockRejectedValueOnce(new Error('db down'))
    const res = await post(validUpdate(), { [HEADER]: SECRET })
    expect(res.status).toBe(500)
    expect(telegramMock.handleTelegramUpdate).not.toHaveBeenCalled()
  })

  it('ошибка обработчика не роняет webhook: 200, чтобы Telegram не дублировал', async () => {
    telegramMock.handleTelegramUpdate.mockRejectedValueOnce(new Error('handler failed'))
    const res = await post(validUpdate(), { [HEADER]: SECRET })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
