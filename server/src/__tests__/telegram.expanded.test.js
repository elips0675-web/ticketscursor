import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockBotInstance = vi.hoisted(() => ({
  on: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
  answerCallbackQuery: vi.fn().mockResolvedValue({}),
  setWebhook: vi.fn().mockResolvedValue({}),
}))
const mockTelegramBotCtor = vi.hoisted(() => vi.fn(function ctor() { return mockBotInstance }))

vi.mock('node-telegram-bot-api', () => ({ default: mockTelegramBotCtor }))

const prismaMock = vi.hoisted(() => ({
  employees: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  telegram_contacts: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  tickets: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  ticket_messages: { create: vi.fn() },
}))
vi.mock('../prisma.js', () => ({ default: prismaMock }))

const featureFlagsMock = vi.hoisted(() => ({ isFeatureEnabled: vi.fn() }))
vi.mock('../feature-flags.js', () => featureFlagsMock)

function resetDbMocks() {
  featureFlagsMock.isFeatureEnabled.mockResolvedValue(true)
  prismaMock.telegram_contacts.findUnique.mockResolvedValue(null)
  prismaMock.telegram_contacts.findFirst.mockResolvedValue(null)
  prismaMock.telegram_contacts.create.mockResolvedValue({ id: 1 })
  prismaMock.telegram_contacts.update.mockResolvedValue({})
  prismaMock.telegram_contacts.upsert.mockResolvedValue({ id: 1 })
  prismaMock.employees.findFirst.mockResolvedValue(null)
  prismaMock.employees.findUnique.mockResolvedValue({ id: 5, name: 'Петя' })
  prismaMock.employees.create.mockResolvedValue({ id: 50, name: 'Telegram User' })
  prismaMock.tickets.findMany.mockResolvedValue([])
  prismaMock.tickets.create.mockResolvedValue({ id: 77, title: 'Тикет' })
  prismaMock.tickets.findUnique.mockResolvedValue({ id: 1, title: 'Тест', created_by: 5, assigned_to: 2 })
  prismaMock.tickets.update.mockResolvedValue({})
  prismaMock.ticket_messages.create.mockResolvedValue({ id: 1 })
}

describe('telegram.js', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_URL
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    mockBotInstance.on.mockClear()
    mockBotInstance.sendMessage.mockClear()
    mockBotInstance.answerCallbackQuery.mockClear()
    mockTelegramBotCtor.mockClear()
    resetDbMocks()
  })

  it('does not init bot when TELEGRAM_BOT_TOKEN is not set', async () => {
    const { initTelegram } = await import('../telegram.js')
    initTelegram()
    expect(mockTelegramBotCtor).not.toHaveBeenCalled()
  })

  it('inits bot when TELEGRAM_BOT_TOKEN is set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const { initTelegram } = await import('../telegram.js')
    initTelegram()
    expect(mockTelegramBotCtor).toHaveBeenCalledWith('test-token', { polling: true })
  })

  it('registers message handler on init', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const { initTelegram } = await import('../telegram.js')
    initTelegram()
    expect(mockBotInstance.on).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('adds chat id on /start message', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const { initTelegram, sendTelegramNotification } = await import('../telegram.js')
    initTelegram()
    const handler = mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
    handler({ text: '/start', chat: { id: 123 } })
    sendTelegramNotification('Test notification')
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(123, 'Test notification')
  })

  it('ignores non-/start messages', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const { initTelegram, sendTelegramNotification } = await import('../telegram.js')
    initTelegram()
    const handler = mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
    handler({ text: '/help', chat: { id: 456 } })
    sendTelegramNotification('Test notification')
    expect(mockBotInstance.sendMessage).not.toHaveBeenCalledWith(456, 'Test notification')
  })

  it('sends welcome message on /start', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const { initTelegram } = await import('../telegram.js')
    initTelegram()
    const handler = mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
    handler({ text: '/start', chat: { id: 789 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(789, '✅ Бот активирован. Вы будете получать уведомления о тикетах.\n\nКоманды:\n/link — привязать аккаунт\n/new — создать тикет\n/tickets — мои тикеты\n/reply <id> <текст> — ответить на тикет')
  })

  it('does not send notification when bot is null', async () => {
    const { sendTelegramNotification } = await import('../telegram.js')
    sendTelegramNotification('Test notification')
    expect(mockBotInstance.sendMessage).not.toHaveBeenCalled()
  })

  it('handles sendMessage error gracefully', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    return import('../telegram.js').then(({ initTelegram, sendTelegramNotification }) => {
      initTelegram()
      const handler = mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
      handler({ text: '/start', chat: { id: 111 } })
      mockBotInstance.sendMessage.mockRejectedValueOnce(new Error('network error'))
      expect(() => sendTelegramNotification('Test')).not.toThrow()
    })
  })

  it('sends notification to multiple chatIds', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const { initTelegram, sendTelegramNotification } = await import('../telegram.js')
    initTelegram()
    const handler = mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
    handler({ text: '/start', chat: { id: 111 } })
    handler({ text: '/start', chat: { id: 222 } })
    sendTelegramNotification('Broadcast message')
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(111, 'Broadcast message')
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(222, 'Broadcast message')
  })
})

// ── Этап 68 + CHW-02: команды /link, /new, /tickets, /reply, callback_query, forward ──
describe('telegram.js — команды и уведомления (Этап 68, CHW-02)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.TELEGRAM_WEBHOOK_URL
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    resetDbMocks()
  })

  async function getModule() {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const mod = await import('../telegram.js')
    mod.initTelegram()
    return mod
  }

  const msgHandler = () => mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
  const cbHandler = () => mockBotInstance.on.mock.calls.find(c => c[0] === 'callback_query')[1]

  it('/start создаёт контакт Telegram, а не сотрудника-агента', async () => {
    await getModule()
    await msgHandler()({
      text: '/start',
      chat: { id: 201 },
      from: { id: 5, first_name: 'Петя', last_name: 'Петров', username: 'petya' },
    })
    expect(prismaMock.telegram_contacts.upsert).toHaveBeenCalledWith({
      where: { telegram_id: 5n },
      create: expect.objectContaining({ telegram_id: 5n, chat_id: 201n, username: 'petya', name: 'Петя Петров' }),
      update: expect.objectContaining({ chat_id: 201n, username: 'petya', name: 'Петя Петров' }),
    })
    expect(prismaMock.employees.create).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(201, expect.stringContaining('Бот активирован'))
  })

  it('/link обновляет существующий контакт и не создаёт сотрудника', async () => {
    prismaMock.telegram_contacts.upsert.mockResolvedValueOnce({ id: 5 })
    await getModule()
    await msgHandler()({ text: '/link', chat: { id: 202 }, from: { id: 5, first_name: 'Петя' } })
    expect(prismaMock.telegram_contacts.upsert).toHaveBeenCalledTimes(1)
    expect(prismaMock.employees.create).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(202, expect.stringContaining('Аккаунт привязан'))
  })

  it('/new при первом тикете создаёт requester-сотрудника и привязывает контакт', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: null, name: 'Петя Петров' })
    prismaMock.employees.create.mockResolvedValueOnce({ id: 50, name: 'Петя Петров' })
    await getModule()
    await msgHandler()({
      text: '/new Помогите с VPN',
      chat: { id: 203 },
      from: { id: 5, first_name: 'Петя', last_name: 'Петров' },
    })
    expect(prismaMock.employees.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: '5@telegram.bot', role: 'requester', name: 'Петя Петров' }),
      select: { id: true, name: true },
    })
    expect(prismaMock.telegram_contacts.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { employee_id: 50 },
    })
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '[Telegram] Помогите с VPN', priority: 'medium', created_by: 50 }),
    })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(203, expect.stringContaining('#77'))
  })

  it('/new без /start создаёт контакт и requester-сотрудника', async () => {
    prismaMock.telegram_contacts.create.mockResolvedValueOnce({ id: 9 })
    prismaMock.employees.create.mockResolvedValueOnce({ id: 51, name: 'Аня' })
    await getModule()
    await msgHandler()({ text: '/new Заявка', chat: { id: 204 }, from: { id: 6, first_name: 'Аня' } })
    expect(prismaMock.telegram_contacts.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ telegram_id: 6n, chat_id: 204n, name: 'Аня' }),
      select: { id: true },
    })
    expect(prismaMock.telegram_contacts.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { employee_id: 51 },
    })
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by: 51 }),
    })
  })

  it('/new повторно не создаёт сотрудника', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 50, name: 'Петя' })
    prismaMock.employees.findUnique.mockResolvedValueOnce({ id: 50, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/new Повторно', chat: { id: 205 }, from: { id: 5, first_name: 'Петя' } })
    expect(prismaMock.employees.create).not.toHaveBeenCalled()
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by: 50 }),
    })
  })

  it('/new при существующем employee по email привязывает контакт без дубля', async () => {
    prismaMock.telegram_contacts.create.mockResolvedValueOnce({ id: 10 })
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 60, name: 'Старый Telegram' })
    await getModule()
    await msgHandler()({ text: '/new Заявка', chat: { id: 224 }, from: { id: 8, first_name: 'Старый' } })
    expect(prismaMock.employees.create).not.toHaveBeenCalled()
    expect(prismaMock.telegram_contacts.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { employee_id: 60 },
    })
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by: 60 }),
    })
  })

  it('/new без userId не создаёт тикет от чужого имени', async () => {
    await getModule()
    await msgHandler()({ text: '/new Заявка', chat: { id: 206 } })
    expect(prismaMock.tickets.create).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(206, expect.stringContaining('пользователя Telegram'))
  })

  it('/tickets без контакта — просит /link', async () => {
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 207 }, from: { id: 999, first_name: 'X' } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(207, expect.stringContaining('/link'))
  })

  it('/tickets с контактом без сотрудника — предлагает /new', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: null, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 208 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(208, expect.stringContaining('/new'))
  })

  it('/tickets без тикетов — «нет тикетов»', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 5, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 209 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(209, expect.stringContaining('нет тикетов'))
  })

  it('/tickets показывает список до 5 тикетов', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 5, name: 'Петя' })
    prismaMock.tickets.findMany.mockResolvedValue([
      { id: 1, title: 'А', status: 'open', priority: 'medium' },
      { id: 2, title: 'Б', status: 'closed', priority: 'low' },
    ])
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 210 }, from: { id: 5 } })
    expect(prismaMock.tickets.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }))
    const msg = mockBotInstance.sendMessage.mock.calls.find(c => c[0] === 210)?.[1]
    expect(msg).toContain('#1')
    expect(msg).toContain('#2')
  })

  it('/reply на несуществующий тикет — «не найден»', async () => {
    prismaMock.tickets.findUnique.mockResolvedValue(null)
    await getModule()
    await msgHandler()({ text: '/reply 99 текст', chat: { id: 211 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(211, expect.stringContaining('не найден'))
  })

  it('/reply без текста — подсказка', async () => {
    await getModule()
    await msgHandler()({ text: '/reply 5', chat: { id: 212 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(212, expect.stringContaining('/reply <id> <текст>'))
  })

  it('/reply создаёт сообщение и обновляет updated_at', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 5, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/reply 1 Привет', chat: { id: 213 }, from: { id: 5 } })
    expect(prismaMock.ticket_messages.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticket_id: 1, sender_id: 5, sender_name: 'Петя', text: 'Привет' }),
    })
    expect(prismaMock.tickets.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { updated_at: expect.any(Date) } })
  })

  it('/reply на чужой тикет — нет доступа, сообщение не создаётся', async () => {
    prismaMock.tickets.findUnique.mockResolvedValue({ id: 1, title: 'Тест', created_by: 1, assigned_to: 2 })
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 5, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/reply 1 Привет', chat: { id: 214 }, from: { id: 5 } })
    expect(prismaMock.ticket_messages.create).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(214, expect.stringContaining('Нет доступа'))
  })

  it('/reply без контакта — просит /link, сообщение не создаётся', async () => {
    await getModule()
    await msgHandler()({ text: '/reply 1 Привет', chat: { id: 215 }, from: { id: 999 } })
    expect(prismaMock.ticket_messages.create).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(215, expect.stringContaining('/link'))
  })

  it('код #123 текст форвардится в активный тикет', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValue({ id: 7, employee_id: 5, name: 'Петя' })
    prismaMock.tickets.findMany.mockResolvedValue([{ id: 3 }])
    await getModule()
    await msgHandler()({ text: '#3 Важное дополнение', chat: { id: 216 }, from: { id: 5 } })
    expect(prismaMock.ticket_messages.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticket_id: 3, text: 'Важное дополнение' }),
    })
  })

  it('свободный текст без активных тикетов — предложение /new', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 5, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: 'просто текст', chat: { id: 217 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(217, expect.stringContaining('/new'))
  })

  it('свободный текст без привязки — просит /link', async () => {
    await getModule()
    await msgHandler()({ text: 'просто текст', chat: { id: 218 }, from: { id: 888 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(218, expect.stringContaining('/link'))
  })

  it('свободный текст с контактом без сотрудника — предлагает /new', async () => {
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: null, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: 'просто текст', chat: { id: 219 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(219, expect.stringContaining('/new'))
  })

  it('флаг telegram_contacts выключен — legacy-поиск по email и роль requester', async () => {
    featureFlagsMock.isFeatureEnabled.mockResolvedValue(false)
    await getModule()
    await msgHandler()({ text: '/start', chat: { id: 220 }, from: { id: 77, first_name: 'Аня' } })
    expect(prismaMock.telegram_contacts.upsert).not.toHaveBeenCalled()
    expect(prismaMock.employees.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: '77@telegram.bot', role: 'requester' }),
    })
  })

  it('ошибка чтения флага — используется таблица контактов (fail-open)', async () => {
    featureFlagsMock.isFeatureEnabled.mockRejectedValue(new Error('db down'))
    prismaMock.telegram_contacts.findUnique.mockResolvedValueOnce({ id: 7, employee_id: 5, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 221 }, from: { id: 5 } })
    expect(prismaMock.telegram_contacts.findUnique).toHaveBeenCalledWith({
      where: { telegram_id: 5n },
      select: { id: true, employee_id: true, name: true },
    })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(221, expect.stringContaining('нет тикетов'))
  })

  it('callback_query ticket_ отвечает answerCallbackQuery', async () => {
    await getModule()
    cbHandler()({ data: 'ticket_12', id: 'q1', message: { chat: { id: 222 } } })
    expect(mockBotInstance.answerCallbackQuery).toHaveBeenCalledWith('q1', { text: 'Открываю тикет #12' })
  })

  it('callback_query с data не ticket_ — игнорируется', async () => {
    await getModule()
    cbHandler()({ data: 'other', id: 'q2', message: { chat: { id: 223 } } })
    expect(mockBotInstance.answerCallbackQuery).not.toHaveBeenCalled()
  })

  it('sendTelegramToUser шлёт конкретному пользователю', async () => {
    const { sendTelegramToUser } = await getModule()
    sendTelegramToUser(3001, 'Ваш тикет обновлён')
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(3001, 'Ваш тикет обновлён')
  })

  it('isTelegramBotActive — false без токена, true после init', async () => {
    vi.resetModules()
    delete process.env.TELEGRAM_BOT_TOKEN
    const fresh = await import('../telegram.js')
    expect(fresh.isTelegramBotActive()).toBe(false)
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    fresh.initTelegram()
    expect(fresh.isTelegramBotActive()).toBe(true)
  })
})

// ── CHW-01: webhook-режим, диспетчер update, ответ оператора в Telegram ──
describe('telegram.js — webhook и двусторонняя синхронизация (CHW-01)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_URL
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    resetDbMocks()
  })

  async function getModule() {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const mod = await import('../telegram.js')
    mod.initTelegram()
    return mod
  }

  it('webhook-режим: polling false и setWebhook с secret_token', async () => {
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.test/api/webhooks/telegram'
    process.env.TELEGRAM_WEBHOOK_SECRET = 'whsec'
    await getModule()
    expect(mockTelegramBotCtor).toHaveBeenCalledWith('test-token', { polling: false })
    expect(mockBotInstance.setWebhook).toHaveBeenCalledWith(
      'https://example.test/api/webhooks/telegram',
      { secret_token: 'whsec' },
    )
    expect(mockBotInstance.on).not.toHaveBeenCalled()
  })

  it('без URL webhook остаётся polling', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'whsec'
    await getModule()
    expect(mockTelegramBotCtor).toHaveBeenCalledWith('test-token', { polling: true })
    expect(mockBotInstance.setWebhook).not.toHaveBeenCalled()
  })

  it('handleTelegramUpdate обрабатывает message', async () => {
    const mod = await getModule()
    const result = await mod.handleTelegramUpdate({
      update_id: 1,
      message: { chat: { id: 301 }, from: { id: 5, first_name: 'Петя' }, text: '/start' },
    })
    expect(result).toEqual({ ok: true, kind: 'message' })
    expect(prismaMock.telegram_contacts.upsert).toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(301, expect.stringContaining('Бот активирован'))
  })

  it('handleTelegramUpdate обрабатывает callback_query', async () => {
    const mod = await getModule()
    const result = await mod.handleTelegramUpdate({
      update_id: 2,
      callback_query: { id: 'q1', data: 'ticket_9', message: { chat: { id: 302 } } },
    })
    expect(result).toEqual({ ok: true, kind: 'callback_query' })
    expect(mockBotInstance.answerCallbackQuery).toHaveBeenCalledWith('q1', { text: 'Открываю тикет #9' })
  })

  it('handleTelegramUpdate без message/callback_query — ignored', async () => {
    const mod = await getModule()
    expect(await mod.handleTelegramUpdate({ update_id: 3 })).toEqual({ ok: true, kind: 'ignored' })
  })

  it('handleTelegramUpdate без бота — bot_inactive', async () => {
    const fresh = await import('../telegram.js')
    expect(await fresh.handleTelegramUpdate({ update_id: 4, message: { chat: { id: 1 } } }))
      .toEqual({ ok: false, reason: 'bot_inactive' })
  })

  it('notifyTelegramRequester: флаг telegram_two_way выключен — не отправляет', async () => {
    featureFlagsMock.isFeatureEnabled.mockImplementation(async (key) => key !== 'telegram_two_way')
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    prismaMock.telegram_contacts.findFirst.mockResolvedValue({ chat_id: 201n, telegram_id: 5n })
    expect(await mod.notifyTelegramRequester(1, 'Ответ', 2)).toBe(false)
    expect(mockBotInstance.sendMessage).not.toHaveBeenCalled()
  })

  it('notifyTelegramRequester: отправитель — создатель тикета, не дублирует', async () => {
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    prismaMock.telegram_contacts.findFirst.mockResolvedValue({ chat_id: 201n, telegram_id: 5n })
    expect(await mod.notifyTelegramRequester(1, 'Ответ', 5)).toBe(false)
    expect(mockBotInstance.sendMessage).not.toHaveBeenCalled()
  })

  it('notifyTelegramRequester: контакт с chat_id — сообщение в чат', async () => {
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    prismaMock.telegram_contacts.findFirst.mockResolvedValue({ chat_id: 201n, telegram_id: 5n })
    expect(await mod.notifyTelegramRequester(7, 'Ответ оператора', 2)).toBe(true)
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith('201', expect.stringContaining('#7'))
  })

  it('notifyTelegramRequester: chat_id пуст — fallback на telegram_id', async () => {
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    prismaMock.telegram_contacts.findFirst.mockResolvedValue({ chat_id: null, telegram_id: 55n })
    expect(await mod.notifyTelegramRequester(7, 'Ответ', 2)).toBe(true)
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith('55', expect.any(String))
  })

  it('notifyTelegramRequester: контакта нет — false', async () => {
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    expect(await mod.notifyTelegramRequester(7, 'Ответ', 2)).toBe(false)
    expect(mockBotInstance.sendMessage).not.toHaveBeenCalled()
  })

  it('notifyTelegramRequester: флаг telegram_contacts off — legacy-поиск по email', async () => {
    featureFlagsMock.isFeatureEnabled.mockImplementation(async (key) => key !== 'telegram_contacts')
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    prismaMock.employees.findUnique.mockResolvedValue({ email: '777@telegram.bot' })
    expect(await mod.notifyTelegramRequester(3, 'Привет', 1)).toBe(true)
    expect(prismaMock.telegram_contacts.findFirst).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith('777', expect.stringContaining('#3'))
  })

  it('notifyTelegramRequester: legacy-сотрудник без telegram-email — false', async () => {
    featureFlagsMock.isFeatureEnabled.mockImplementation(async (key) => key !== 'telegram_contacts')
    const mod = await getModule()
    prismaMock.tickets.findUnique.mockResolvedValue({ created_by: 5 })
    prismaMock.employees.findUnique.mockResolvedValue({ email: 'user@company.ru' })
    expect(await mod.notifyTelegramRequester(3, 'Привет', 1)).toBe(false)
  })

  it('notifyTelegramRequester без бота — false', async () => {
    const fresh = await import('../telegram.js')
    expect(await fresh.notifyTelegramRequester(1, 'Ответ', 2)).toBe(false)
  })
})
