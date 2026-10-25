// CHW-08: rich messages — приём payload в трёх точках (тикет, командный чат,
// виджет), kill switch rich_messages и отказ на невалидной схеме.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateFeatureFlagCache } from '../feature-flags.js'

const agentToken = jwt.sign({ userId: 3, role: 'agent', name: 'Дмитрий Сидоров' }, JWT_SECRET, { expiresIn: '1h' })

const CARD = {
  blocks: [
    {
      type: 'card',
      title: 'Счёт готов',
      subtitle: 'Октябрь',
      text: 'Оплатите до 5 ноября.',
      actions: [{ type: 'postback', label: 'Напомнить', value: 'remind' }],
    },
    { type: 'chips', options: [{ label: 'Спасибо', value: 'thanks' }] },
  ],
}

let ticket
let chat
let channel
let conversation

async function setRichMessagesFlag(enabled) {
  await prisma.feature_flags.updateMany({ where: { key: 'rich_messages' }, data: { enabled } })
  invalidateFeatureFlagCache()
}

beforeAll(async () => {
  ticket = await prisma.tickets.create({
    data: {
      title: 'CHW-08: rich messages',
      description: 'Проверка rich_payload',
      status: 'open',
      priority: 'medium',
      category: 'support',
      created_by: 3,
      assigned_to: 3,
    },
  })
  chat = await prisma.chat_rooms.create({ data: { name: 'CHW-08 rich chat', type: 'group' } })
  channel = await prisma.widget_channels.create({
    data: {
      name: 'CHW-08 widget',
      website_token: `rich${Date.now().toString(16)}`,
      allowed_origins: '',
      welcome_message: '',
      offline_message: '',
    },
  })
  conversation = await prisma.widget_conversations.create({
    data: {
      channel_id: channel.id,
      visitor_id: `visitor-${Date.now()}`,
      visitor_token: `token${Date.now().toString(16)}`,
      visitor_name: 'Посетитель',
    },
  })
})

afterAll(async () => {
  await setRichMessagesFlag(true)
  if (ticket) await prisma.tickets.deleteMany({ where: { id: ticket.id } })
  if (chat) await prisma.chat_rooms.deleteMany({ where: { id: chat.id } })
  if (channel) await prisma.widget_channels.deleteMany({ where: { id: channel.id } })
})

beforeEach(async () => {
  await setRichMessagesFlag(true)
})

describe('POST /api/tickets/:id/messages — rich payload', () => {
  it('сохраняет карточку и чипы как rich_json', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Счёт во вложении', rich_payload: CARD })

    expect(res.status).toBe(201)
    expect(res.body.data.content_type).toBe('rich_json')
    expect(res.body.data.rich_payload.blocks).toHaveLength(2)

    const row = await prisma.ticket_messages.findUnique({ where: { id: res.body.data.id } })
    expect(row.content_type).toBe('rich_json')
    expect(row.rich_payload.blocks[0].title).toBe('Счёт готов')
  })

  it('обычный текст остаётся text с пустым rich_payload', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Просто текст' })

    expect(res.status).toBe(201)
    expect(res.body.data.content_type).toBe('text')
    expect(res.body.data.rich_payload).toBeNull()
  })

  it('невалидный блок — 400 INVALID_RICH_PAYLOAD и строка не создаётся', async () => {
    const before = await prisma.ticket_messages.count({ where: { ticket_id: ticket.id } })
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Плохая карточка', rich_payload: { blocks: [{ type: 'video', url: 'https://example.com' }] } })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_RICH_PAYLOAD')
    expect(await prisma.ticket_messages.count({ where: { ticket_id: ticket.id } })).toBe(before)
  })

  it('флаг rich_messages выключен — 400 RICH_MESSAGES_DISABLED', async () => {
    await setRichMessagesFlag(false)
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Карточка', rich_payload: CARD })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('RICH_MESSAGES_DISABLED')
  })
})

describe('POST /api/chats/:id/messages — rich payload', () => {
  it('сохраняет rich_json в chat_messages', async () => {
    const res = await request(app)
      .post(`/api/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Карточка в чат', rich_payload: CARD })

    expect(res.status).toBe(201)
    expect(res.body.data.content_type).toBe('rich_json')

    const row = await prisma.chat_messages.findUnique({ where: { id: res.body.data.id } })
    expect(row.content_type).toBe('rich_json')
    expect(row.rich_payload.blocks[1].options[0].value).toBe('thanks')
  })

  it('невалидный payload — 400 INVALID_RICH_PAYLOAD', async () => {
    const res = await request(app)
      .post(`/api/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Плохо', rich_payload: { blocks: [] } })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_RICH_PAYLOAD')
  })

  it('флаг выключен — 400 RICH_MESSAGES_DISABLED', async () => {
    await setRichMessagesFlag(false)
    const res = await request(app)
      .post(`/api/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Карточка', rich_payload: CARD })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('RICH_MESSAGES_DISABLED')
  })
})

describe('POST /api/widget-inbox/conversations/:id/messages — rich payload', () => {
  it('сохраняет rich_json и отдаёт блоки оператору и посетителю', async () => {
    const res = await request(app)
      .post(`/api/widget-inbox/conversations/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Ответ с карточкой', rich_payload: CARD })

    expect(res.status).toBe(201)
    expect(res.body.data.content_type).toBe('rich_json')
    expect(res.body.data.rich_payload.blocks[0].title).toBe('Счёт готов')

    const row = await prisma.widget_messages.findUnique({ where: { id: res.body.data.id } })
    expect(row.content_type).toBe('rich_json')

    const publicRes = await request(app)
      .get(`/api/widget/${channel.website_token}/conversations/${conversation.visitor_token}`)
    expect(publicRes.status).toBe(200)
    const last = publicRes.body.data.messages.at(-1)
    expect(last.content_type).toBe('rich_json')
    expect(last.rich_payload.blocks).toHaveLength(2)
  })

  it('флаг выключен — 400 RICH_MESSAGES_DISABLED', async () => {
    await setRichMessagesFlag(false)
    const res = await request(app)
      .post(`/api/widget-inbox/conversations/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ text: 'Карточка', rich_payload: CARD })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('RICH_MESSAGES_DISABLED')
  })
})
