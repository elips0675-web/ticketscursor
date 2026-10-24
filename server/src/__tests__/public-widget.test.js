import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const prismaMock = {
  feature_flags: { findMany: vi.fn().mockResolvedValue([{ key: 'chat_widget', enabled: true }]) },
  widget_channels: {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  widget_conversations: {
    create: vi.fn(),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
  widget_messages: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
}

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../outbox.js', () => ({ enqueueEvent: vi.fn() }))

const CHANNEL = {
  id: 7,
  name: 'Сайт',
  website_token: 'website-token-1',
  enabled: true,
  welcome_message: 'Здравствуйте!',
  offline_message: 'Мы офлайн',
  color: '#1f93ff',
}

const CONVERSATION = {
  id: 42,
  channel_id: 7,
  visitor_id: 'visitor-uuid-0001',
  visitor_token: 'conversation-token-1',
  visitor_name: 'Иван',
  visitor_email: 'ivan@example.com',
  status: 'open',
  created_at: new Date('2026-10-24T10:00:00Z'),
}

describe('public-widget route', () => {
  let router
  let enqueueEvent

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    prismaMock.feature_flags.findMany.mockResolvedValue([{ key: 'chat_widget', enabled: true }])
    prismaMock.widget_channels.findUnique.mockResolvedValue(null)
    prismaMock.widget_channels.findFirst.mockResolvedValue(null)
    prismaMock.widget_conversations.findUnique.mockResolvedValue(null)
    prismaMock.widget_conversations.update.mockResolvedValue({})
    prismaMock.widget_messages.findMany.mockResolvedValue([])
    const mod = await import('../routes/public-widget.js')
    router = mod.default
    const outbox = await import('../outbox.js')
    enqueueEvent = outbox.enqueueEvent
  })

  function mockReqRes(overrides = {}) {
    const req = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...overrides }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    return { req, res }
  }

  function findHandler(method, path) {
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === path && layer.route.methods[method]) {
        return layer.route.stack[layer.route.stack.length - 1].handle
      }
    }
    return null
  }

  describe('GET /default', () => {
    it('404 когда флаг chat_widget выключен', async () => {
      prismaMock.feature_flags.findMany.mockResolvedValueOnce([])
      const handler = findHandler('get', '/default')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(prismaMock.widget_channels.findFirst).not.toHaveBeenCalled()
    })

    it('404 когда нет включённого канала', async () => {
      const handler = findHandler('get', '/default')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(prismaMock.widget_channels.findFirst).toHaveBeenCalledWith({
        where: { enabled: true },
        orderBy: { id: 'asc' },
      })
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('200: отдаёт только публичные поля канала', async () => {
      prismaMock.widget_channels.findFirst.mockResolvedValueOnce(CHANNEL)
      const handler = findHandler('get', '/default')
      const { req, res } = mockReqRes()
      await handler(req, res)
      const payload = res.json.mock.calls[0][0]
      expect(payload.data).toEqual({ token: CHANNEL.website_token, name: 'Сайт', color: '#1f93ff' })
      expect(JSON.stringify(payload)).not.toContain('allowed_origins')
      expect(JSON.stringify(payload)).not.toContain('welcome_message')
    })

    it('500 при сбое БД', async () => {
      prismaMock.widget_channels.findFirst.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/default')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /:token/config', () => {
    it('404 когда канал не найден', async () => {
      const handler = findHandler('get', '/:token/config')
      const { req, res } = mockReqRes({ params: { token: 'nope' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('404 когда канал выключен', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce({ ...CHANNEL, enabled: false })
      const handler = findHandler('get', '/:token/config')
      const { req, res } = mockReqRes({ params: { token: CHANNEL.website_token } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('404 когда флаг chat_widget выключен', async () => {
      prismaMock.feature_flags.findMany.mockResolvedValueOnce([])
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      const handler = findHandler('get', '/:token/config')
      const { req, res } = mockReqRes({ params: { token: CHANNEL.website_token } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('отдаёт welcome/offline/color без секретов', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      const handler = findHandler('get', '/:token/config')
      const { req, res } = mockReqRes({ params: { token: CHANNEL.website_token } })
      await handler(req, res)
      const payload = res.json.mock.calls[0][0]
      expect(payload.data).toEqual({
        name: 'Сайт',
        welcome: 'Здравствуйте!',
        offline: 'Мы офлайн',
        color: '#1f93ff',
      })
      expect(JSON.stringify(payload)).not.toContain(CHANNEL.website_token)
    })
  })

  describe('POST /:token/conversations', () => {
    it('400 без visitor_id', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      const handler = findHandler('post', '/:token/conversations')
      const { req, res } = mockReqRes({ params: { token: CHANNEL.website_token }, body: {} })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('400 на некорректный email', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      const handler = findHandler('post', '/:token/conversations')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token },
        body: { visitor_id: 'visitor-uuid-0001', email: 'not-an-email' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('201: создаёт диалог, отдаёт токен посетителя, имя по умолчанию «Гость»', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      prismaMock.widget_conversations.create.mockImplementationOnce(({ data }) => ({
        ...data,
        id: 42,
        created_at: new Date('2026-10-24T10:00:00Z'),
      }))
      const handler = findHandler('post', '/:token/conversations')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token },
        body: { visitor_id: 'visitor-uuid-0001' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      const payload = res.json.mock.calls[0][0]
      expect(payload.data.token).toMatch(/^[0-9a-f]{48}$/)
      expect(payload.data.name).toBe('Гость')
      expect(prismaMock.widget_conversations.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ channel_id: 7, status: 'open' }) }),
      )
    })

    it('500 при сбое БД, а не пустой успех', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      prismaMock.widget_conversations.create.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('post', '/:token/conversations')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token },
        body: { visitor_id: 'visitor-uuid-0001' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /:token/conversations/:conversationToken', () => {
    it('404 на чужой канал (токен диалога не открывает диалог другого канала)', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce({ ...CONVERSATION, channel_id: 999 })
      const handler = findHandler('get', '/:token/conversations/:conversationToken')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: CONVERSATION.visitor_token },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('404 на неизвестный токен диалога', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      const handler = findHandler('get', '/:token/conversations/:conversationToken')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: 'missing' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('200: отдаёт сообщения и применяет after', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce(CONVERSATION)
      prismaMock.widget_messages.findMany.mockResolvedValueOnce([
        { id: 12, sender_type: 'agent', sender_name: 'Оператор', text: 'Здравствуйте', created_at: new Date() },
      ])
      const handler = findHandler('get', '/:token/conversations/:conversationToken')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: CONVERSATION.visitor_token },
        query: { after: '10' },
      })
      await handler(req, res)
      expect(prismaMock.widget_messages.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversation_id: 42, id: { gt: 10 } } }),
      )
      const payload = res.json.mock.calls[0][0]
      expect(payload.data.messages).toHaveLength(1)
      expect(payload.data.status).toBe('open')
    })
  })

  describe('POST /:token/conversations/:conversationToken/messages', () => {
    function setupConversation() {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce(CONVERSATION)
    }

    it('400 на пустой текст', async () => {
      setupConversation()
      const handler = findHandler('post', '/:token/conversations/:conversationToken/messages')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: CONVERSATION.visitor_token },
        body: { text: '   ' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('400 на текст длиннее 4000', async () => {
      setupConversation()
      const handler = findHandler('post', '/:token/conversations/:conversationToken/messages')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: CONVERSATION.visitor_token },
        body: { text: 'x'.repeat(4001) },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('409 в закрытый диалог', async () => {
      prismaMock.widget_channels.findUnique.mockResolvedValueOnce(CHANNEL)
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce({ ...CONVERSATION, status: 'closed' })
      const handler = findHandler('post', '/:token/conversations/:conversationToken/messages')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: CONVERSATION.visitor_token },
        body: { text: 'Ау?' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('201: сохраняет сообщение, поднимает unread и ставит событие агентам', async () => {
      setupConversation()
      prismaMock.widget_messages.create.mockResolvedValueOnce({
        id: 77,
        sender_type: 'visitor',
        sender_name: 'Иван',
        text: 'Не работает принтер',
        created_at: new Date('2026-10-24T10:05:00Z'),
      })
      const handler = findHandler('post', '/:token/conversations/:conversationToken/messages')
      const { req, res } = mockReqRes({
        params: { token: CHANNEL.website_token, conversationToken: CONVERSATION.visitor_token },
        body: { text: '  Не работает принтер  ' },
      })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(prismaMock.widget_messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversation_id: 42, sender_type: 'visitor', text: 'Не работает принтер' }),
        }),
      )
      expect(prismaMock.widget_conversations.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: expect.objectContaining({ unread_for_agent: { increment: 1 } }),
        }),
      )
      expect(enqueueEvent).toHaveBeenCalledWith(
        'widget:message',
        'agents',
        expect.objectContaining({ conversationId: 42 }),
      )
    })
  })

  describe('схема БД под запросы роута', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

    function modelFields(schema, model) {
      const block = schema.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`))
      if (!block) return null
      return block[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0])
    }

    it('модели виджета объявлены в prisma с полями, которые читает роут', () => {
      const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8')
      expect(modelFields(schema, 'widget_channels')).toEqual(
        expect.arrayContaining(['website_token', 'welcome_message', 'offline_message', 'enabled']),
      )
      expect(modelFields(schema, 'widget_conversations')).toEqual(
        expect.arrayContaining(['channel_id', 'visitor_id', 'visitor_token', 'status', 'unread_for_agent']),
      )
      expect(modelFields(schema, 'widget_messages')).toEqual(
        expect.arrayContaining(['conversation_id', 'sender_type', 'employee_id', 'text']),
      )
    })

    it('таблицы и флаг приходят миграцией, а не создаются в рантайме', () => {
      const dir = join(root, 'migrations')
      const sources = readdirSync(dir)
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFileSync(join(dir, file), 'utf8'))
        .join('\n')
      expect(sources).toContain("createTable('widget_channels'")
      expect(sources).toContain("createTable('widget_conversations'")
      expect(sources).toContain("createTable('widget_messages'")
      expect(sources).toContain("key: 'chat_widget'")
      expect(readFileSync(join(root, 'src', 'routes', 'public-widget.js'), 'utf8')).not.toContain('CREATE TABLE')
    })
  })
})
