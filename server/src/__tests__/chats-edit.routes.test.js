// Этап 65 (подзадача 2): редактирование сообщений чата —
// PUT /api/chats/:id/messages/:msgId (только автор) + WS message:edited.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('../audit.js', () => ({
  auditLogMiddleware: (req, res, next) => next(),
  logAudit: vi.fn(),
}))

vi.mock('../outbox.js', () => ({
  enqueueEvent: vi.fn(),
}))

vi.mock('../routes/notifications.js', () => ({
  createNotification: vi.fn(),
}))

vi.mock('../middleware/idempotency.js', () => ({
  idempotent: (req, res, next) => next(),
}))

vi.mock('../middleware.js', () => {
  const JWT_SECRET = 'test-secret-key-12345'
  const ROLE_HIERARCHY = ['requester', 'agent', 'senior_agent', 'admin', 'super_admin']
  return {
    JWT_SECRET,
    authenticateToken: (req, res, next) => {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' })
      }
      try {
        req.user = require('jsonwebtoken').verify(authHeader.split(' ')[1], JWT_SECRET)
        return next()
      } catch {
        return res.status(403).json({ message: 'Invalid token' })
      }
    },
    requireRole: (...roles) => (req, res, next) => {
      if (!req.user) return res.status(403).json({ message: 'Forbidden' })
      const userLevel = ROLE_HIERARCHY.indexOf(req.user.role)
      const requiredLevel = Math.max(...roles.map((r) => ROLE_HIERARCHY.indexOf(r)))
      if (userLevel < requiredLevel || userLevel === -1) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      next()
    },
  }
})

vi.mock('../services/chats.service.js', () => ({
  getChats: vi.fn(),
  getChatById: vi.fn(),
  createMessage: vi.fn(),
  getChatParticipants: vi.fn(),
  markRead: vi.fn(),
  findOrCreatePersonalChat: vi.fn(),
  updateMessage: vi.fn(),
}))

import { JWT_SECRET } from '../middleware.js'
import { enqueueEvent } from '../outbox.js'
import { updateMessage } from '../services/chats.service.js'
import chatsRouter from '../routes/chats.js'

const ADMIN = jwt.sign({ userId: 42, name: 'Admin', role: 'admin' }, JWT_SECRET)
const AGENT_A = jwt.sign({ userId: 7, name: 'AgentA', role: 'agent' }, JWT_SECRET)
const AGENT_B = jwt.sign({ userId: 8, name: 'AgentB', role: 'agent' }, JWT_SECRET)

let app

beforeEach(() => {
  vi.clearAllMocks()
  app = express()
  app.use(express.json())
  app.use('/api/chats', chatsRouter)
})

const EDITED_MSG = { id: 5, chat_id: 1, sender_id: 7, sender_name: 'AgentA', text: 'new text', edited_at: new Date().toISOString() }

describe('PUT /api/chats/:id/messages/:msgId (Этап 65)', () => {
  it('200: автор редактирует своё сообщение + WS event', async () => {
    updateMessage.mockResolvedValue({ message: EDITED_MSG })
    const res = await request(app)
      .put('/api/chats/1/messages/5')
      .set('Authorization', `Bearer ${AGENT_A}`)
      .send({ text: 'new text' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.text).toBe('new text')
    expect(updateMessage).toHaveBeenCalledWith({
      id: 5,
      chatId: 1,
      userId: 7,
      text: 'new text',
    })
    expect(enqueueEvent).toHaveBeenCalledWith('message:edited', 'chat:1', EDITED_MSG)
  })

  it('400: пустой текст', async () => {
    const res = await request(app)
      .put('/api/chats/1/messages/5')
      .set('Authorization', `Bearer ${AGENT_A}`)
      .send({ text: '   ' })
    expect(res.status).toBe(400)
    expect(updateMessage).not.toHaveBeenCalled()
  })

  it('400: текст длиннее 2000 символов', async () => {
    const res = await request(app)
      .put('/api/chats/1/messages/5')
      .set('Authorization', `Bearer ${AGENT_A}`)
      .send({ text: 'x'.repeat(2001) })
    expect(res.status).toBe(400)
  })

  it('403: чужое сообщение — только автор', async () => {
    updateMessage.mockResolvedValue({ error: 'FORBIDDEN' })
    const res = await request(app)
      .put('/api/chats/1/messages/5')
      .set('Authorization', `Bearer ${AGENT_B}`)
      .send({ text: 'steal' })
    expect(res.status).toBe(403)
    expect(enqueueEvent).not.toHaveBeenCalled()
  })

  it('404: сообщение не найдено/удалено', async () => {
    updateMessage.mockResolvedValue({ error: 'NOT_FOUND' })
    const res = await request(app)
      .put('/api/chats/1/messages/999')
      .set('Authorization', `Bearer ${AGENT_A}`)
      .send({ text: 'x' })
    expect(res.status).toBe(404)
  })

  it('401: без токена', async () => {
    const res = await request(app).put('/api/chats/1/messages/5').send({ text: 'x' })
    expect(res.status).toBe(401)
  })

  it('500 при ошибке БД', async () => {
    updateMessage.mockRejectedValue(new Error('db down'))
    const res = await request(app)
      .put('/api/chats/1/messages/5')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ text: 'x' })
    expect(res.status).toBe(500)
  })
})

describe('POST /api/chats/:id/messages с replyToId (Этап 65, reply-to/threads)', () => {
  it('201: сообщение-ответ создано, replyToId ушёл в сервис + WS event с reply preview', async () => {
    const repliedMsg = {
      id: 5,
      chat_id: 1,
      sender_id: 7,
      sender_name: 'AgentA',
      text: 'исходное сообщение',
      reply_to: { id: 3, sender_id: 2, sender_name: 'AgentB', text: 'вопрос' },
    }
    updateMessage.mockClear()
    const { createMessage, getChatParticipants } = await import('../services/chats.service.js')
    createMessage.mockResolvedValue(repliedMsg)
    getChatParticipants.mockResolvedValue([])
    const { enqueueEvent } = await import('../outbox.js')
    const res = await request(app)
      .post('/api/chats/1/messages')
      .set('Authorization', `Bearer ${AGENT_A}`)
      .send({ text: 'ответ', replyToId: 3 })
    expect(res.status).toBe(201)
    expect(res.body.data.reply_to.text).toBe('вопрос')
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ replyToId: 3, text: 'ответ' }))
    expect(enqueueEvent).toHaveBeenCalledWith('message:new', 'chat:1', repliedMsg)
  })

  it('404: исходное сообщение не найдено в чате', async () => {
    const { createMessage } = await import('../services/chats.service.js')
    createMessage.mockResolvedValue({ error: 'REPLY_NOT_FOUND' })
    const res = await request(app)
      .post('/api/chats/1/messages')
      .set('Authorization', `Bearer ${AGENT_A}`)
      .send({ text: 'ответ', replyToId: 999 })
    expect(res.status).toBe(404)
  })
})