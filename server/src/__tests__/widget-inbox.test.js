import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = {
  widget_conversations: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ id: 42, status: 'open', unread_for_agent: 0 }),
  },
  widget_messages: { create: vi.fn() },
  employees: { findUnique: vi.fn().mockResolvedValue(null) },
  widget_channels: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  },
  feature_flags: { findMany: vi.fn().mockResolvedValue([{ key: 'rich_messages', enabled: true }]) },
}

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../outbox.js', () => ({ enqueueEvent: vi.fn() }))

const CONVERSATION = {
  id: 42,
  channel_id: 7,
  visitor_id: 'visitor-uuid-0001',
  visitor_token: 'conversation-token-1',
  visitor_name: 'Иван',
  visitor_email: 'ivan@example.com',
  status: 'open',
  unread_for_agent: 2,
  last_message_at: new Date('2026-10-24T10:05:00Z'),
  created_at: new Date('2026-10-24T10:00:00Z'),
}

describe('widget-inbox route', () => {
  let router
  let enqueueEvent

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    prismaMock.widget_conversations.findMany.mockResolvedValue([])
    prismaMock.widget_conversations.findUnique.mockResolvedValue(null)
    prismaMock.widget_conversations.update.mockResolvedValue({ id: 42, status: 'open', unread_for_agent: 0 })
    prismaMock.widget_channels.findMany.mockResolvedValue([])
    const mod = await import('../routes/widget-inbox.js')
    router = mod.default
    const outbox = await import('../outbox.js')
    enqueueEvent = outbox.enqueueEvent
  })

  function mockReqRes(overrides = {}) {
    const req = {
      body: {},
      params: {},
      query: {},
      user: { userId: 5, name: 'Оператор', role: 'agent' },
      ...overrides,
    }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
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

  describe('GET /conversations', () => {
    it('по умолчанию отдаёт открытые и последнее сообщение', async () => {
      prismaMock.widget_conversations.findMany.mockResolvedValueOnce([
        {
          ...CONVERSATION,
          channel: { name: 'Сайт' },
          messages: [
            { id: 9, sender_type: 'visitor', sender_name: 'Иван', text: 'Привет', created_at: new Date() },
          ],
        },
      ])
      const handler = findHandler('get', '/conversations')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(prismaMock.widget_conversations.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' }, take: 50 }),
      )
      const payload = res.json.mock.calls[0][0]
      expect(payload.data[0]).toEqual(
        expect.objectContaining({ id: 42, channel: 'Сайт', unread_for_agent: 2, last_message: expect.objectContaining({ id: 9 }) }),
      )
    })

    it('фильтрует по статусу и поиску', async () => {
      const handler = findHandler('get', '/conversations')
      const { req, res } = mockReqRes({ query: { status: 'closed', q: 'ivan' } })
      await handler(req, res)
      expect(prismaMock.widget_conversations.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'closed',
            OR: [{ visitor_name: { contains: 'ivan' } }, { visitor_email: { contains: 'ivan' } }],
          },
        }),
      )
    })

    it('игнорирует неизвестный статус и ограничивает limit', async () => {
      const handler = findHandler('get', '/conversations')
      const { req, res } = mockReqRes({ query: { status: 'deleted', limit: '9999' } })
      await handler(req, res)
      expect(prismaMock.widget_conversations.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' }, take: 100 }),
      )
    })

    it('500 при сбое БД', async () => {
      prismaMock.widget_conversations.findMany.mockRejectedValueOnce(new Error('boom'))
      const handler = findHandler('get', '/conversations')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('GET /conversations/:id', () => {
    it('400 на нечисловой id', async () => {
      const handler = findHandler('get', '/conversations/:id')
      const { req, res } = mockReqRes({ params: { id: 'abc' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('404 на неизвестный диалог', async () => {
      const handler = findHandler('get', '/conversations/:id')
      const { req, res } = mockReqRes({ params: { id: '42' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('200: отдаёт переписку и контакт посетителя', async () => {
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce({
        ...CONVERSATION,
        channel: { name: 'Сайт', color: '#1f93ff' },
        messages: [
          { id: 1, sender_type: 'visitor', sender_name: 'Иван', text: 'Привет', created_at: new Date() },
          { id: 2, sender_type: 'agent', sender_name: 'Оператор', text: 'Здравствуйте', created_at: new Date() },
        ],
      })
      const handler = findHandler('get', '/conversations/:id')
      const { req, res } = mockReqRes({ params: { id: '42' } })
      await handler(req, res)
      const payload = res.json.mock.calls[0][0]
      expect(payload.data.messages).toHaveLength(2)
      expect(payload.data).toEqual(expect.objectContaining({ visitor_name: 'Иван', visitor_email: 'ivan@example.com' }))
      expect(JSON.stringify(payload)).not.toContain('conversation-token-1')
    })
  })

  describe('POST /conversations/:id/messages', () => {
    it('400 на пустой текст', async () => {
      const handler = findHandler('post', '/conversations/:id/messages')
      const { req, res } = mockReqRes({ params: { id: '42' }, body: { text: '' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('400 на текст длиннее 4000', async () => {
      const handler = findHandler('post', '/conversations/:id/messages')
      const { req, res } = mockReqRes({ params: { id: '42' }, body: { text: 'x'.repeat(4001) } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('404 на неизвестный диалог', async () => {
      const handler = findHandler('post', '/conversations/:id/messages')
      const { req, res } = mockReqRes({ params: { id: '42' }, body: { text: 'Ответ' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('201: пишет от имени оператора, снимает unread, открывает диалог и шлёт два события', async () => {
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce(CONVERSATION)
      prismaMock.widget_messages.create.mockResolvedValueOnce({
        id: 88,
        sender_type: 'agent',
        sender_name: 'Оператор',
        text: 'Здравствуйте, слушаю',
        created_at: new Date('2026-10-24T10:06:00Z'),
      })
      const handler = findHandler('post', '/conversations/:id/messages')
      const { req, res } = mockReqRes({ params: { id: '42' }, body: { text: '  Здравствуйте, слушаю  ' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(prismaMock.widget_messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversation_id: 42,
            sender_type: 'agent',
            employee_id: 5,
            sender_name: 'Оператор',
            text: 'Здравствуйте, слушаю',
          }),
        }),
      )
      expect(prismaMock.widget_conversations.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: expect.objectContaining({ status: 'open', unread_for_agent: 0 }),
        }),
      )
      expect(enqueueEvent).toHaveBeenCalledTimes(2)
      expect(enqueueEvent).toHaveBeenCalledWith('widget:message', 'widget:42', expect.any(Object))
      expect(enqueueEvent).toHaveBeenCalledWith('widget:message', 'agents', expect.any(Object))
    })
    it('подписывает ответ именем из БД, когда в JWT нет name', async () => {
      prismaMock.widget_conversations.findUnique.mockResolvedValueOnce(CONVERSATION)
      prismaMock.employees.findUnique.mockResolvedValueOnce({ name: 'Мария Оператор' })
      prismaMock.widget_messages.create.mockResolvedValueOnce({
        id: 89,
        sender_type: 'agent',
        sender_name: 'Мария Оператор',
        text: 'Добрый день',
        created_at: new Date(),
      })
      const handler = findHandler('post', '/conversations/:id/messages')
      const { req, res } = mockReqRes({
        params: { id: '42' },
        body: { text: 'Добрый день' },
        user: { userId: 5, role: 'agent' },
      })
      await handler(req, res)
      expect(prismaMock.employees.findUnique).toHaveBeenCalledWith({ where: { id: 5 }, select: { name: true } })
      expect(prismaMock.widget_messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sender_name: 'Мария Оператор' }) }),
      )
    })
  })

  describe('POST /conversations/:id/read|close|reopen', () => {
    it('read: снимает счётчик', async () => {
      const handler = findHandler('post', '/conversations/:id/read')
      const { req, res } = mockReqRes({ params: { id: '42' } })
      await handler(req, res)
      expect(prismaMock.widget_conversations.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { unread_for_agent: 0 },
      })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 42, unread_for_agent: 0 } })
    })

    it('read: 404 когда диалога нет (P2025)', async () => {
      const err = Object.assign(new Error('not found'), { code: 'P2025' })
      prismaMock.widget_conversations.update.mockRejectedValueOnce(err)
      const handler = findHandler('post', '/conversations/:id/read')
      const { req, res } = mockReqRes({ params: { id: '42' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('close: ставит статус closed', async () => {
      prismaMock.widget_conversations.update.mockResolvedValueOnce({ id: 42, status: 'closed' })
      const handler = findHandler('post', '/conversations/:id/close')
      const { req, res } = mockReqRes({ params: { id: '42' } })
      await handler(req, res)
      expect(prismaMock.widget_conversations.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { status: 'closed', unread_for_agent: 0 },
      })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 42, status: 'closed' } })
    })

    it('reopen: возвращает open', async () => {
      prismaMock.widget_conversations.update.mockResolvedValueOnce({ id: 42, status: 'open' })
      const handler = findHandler('post', '/conversations/:id/reopen')
      const { req, res } = mockReqRes({ params: { id: '42' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 42, status: 'open' } })
    })
  })

  describe('каналы', () => {
    it('GET /channels отдаёт список', async () => {
      prismaMock.widget_channels.findMany.mockResolvedValueOnce([{ id: 7, name: 'Сайт' }])
      const handler = findHandler('get', '/channels')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 7, name: 'Сайт' }] })
    })

    it('POST /channels: 400 без имени', async () => {
      const handler = findHandler('post', '/channels')
      const { req, res } = mockReqRes({ body: { name: '  ' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('POST /channels: 201 с новым website_token', async () => {
      prismaMock.widget_channels.create.mockImplementationOnce(({ data }) => ({ id: 8, ...data }))
      const handler = findHandler('post', '/channels')
      const { req, res } = mockReqRes({ body: { name: 'Магазин', allowed_origins: ['https://a.ru', 'https://b.ru'] } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      const payload = res.json.mock.calls[0][0]
      expect(payload.data.website_token).toMatch(/^[0-9a-f]{32}$/)
      expect(payload.data.allowed_origins).toBe('https://a.ru\nhttps://b.ru')
    })

    it('PATCH /channels/:id: 400 на невалидный цвет', async () => {
      const handler = findHandler('patch', '/channels/:id')
      const { req, res } = mockReqRes({ params: { id: '7' }, body: { color: 'red' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('PATCH /channels/:id: 200 обновляет только переданные поля', async () => {
      prismaMock.widget_channels.update.mockResolvedValueOnce({ id: 7, name: 'Сайт', enabled: false })
      const handler = findHandler('patch', '/channels/:id')
      const { req, res } = mockReqRes({ params: { id: '7' }, body: { enabled: false } })
      await handler(req, res)
      expect(prismaMock.widget_channels.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { enabled: false } })
    })

    it('rotate-token: выдаёт новый токен', async () => {
      prismaMock.widget_channels.update.mockImplementationOnce(({ data }) => ({ id: 7, ...data }))
      const handler = findHandler('post', '/channels/:id/rotate-token')
      const { req, res } = mockReqRes({ params: { id: '7' } })
      await handler(req, res)
      const payload = res.json.mock.calls[0][0]
      expect(payload.data.website_token).toMatch(/^[0-9a-f]{32}$/)
    })
  })
})
