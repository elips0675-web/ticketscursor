import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockBotInstance = vi.hoisted(() => ({
  on: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
  answerCallbackQuery: vi.fn().mockResolvedValue({}),
}))
const mockTelegramBotCtor = vi.hoisted(() => vi.fn(function ctor() { return mockBotInstance }))

vi.mock('node-telegram-bot-api', () => ({ default: mockTelegramBotCtor }))

const prismaMock = vi.hoisted(() => ({
  employees: { findFirst: vi.fn(), create: vi.fn() },
  tickets: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  ticket_messages: { create: vi.fn() },
}))
vi.mock('../prisma.js', () => ({ default: prismaMock }))

describe('telegram.js', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TELEGRAM_BOT_TOKEN
    mockBotInstance.on.mockClear()
    mockBotInstance.sendMessage.mockClear()
    mockBotInstance.answerCallbackQuery.mockClear()
    mockTelegramBotCtor.mockClear()
    // дефолтные ответы БД
    prismaMock.employees.findFirst.mockResolvedValue(null)
    prismaMock.employees.create.mockResolvedValue({ id: 50, name: 'Telegram User', email: '1@telegram.bot' })
    prismaMock.tickets.findMany.mockResolvedValue([])
    prismaMock.tickets.create.mockResolvedValue({ id: 77, title: 'Тикет' })
    prismaMock.tickets.findUnique.mockResolvedValue({ id: 1, title: 'Тест', created_by: 1, assigned_to: 2 })
    prismaMock.tickets.update.mockResolvedValue({})
    prismaMock.ticket_messages.create.mockResolvedValue({ id: 1 })
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

// ── Этап 68: команды /link, /new, /tickets, /reply, callback_query, forward ──
describe('telegram.js — команды и уведомления (Этап 68)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.employees.findFirst.mockResolvedValue(null)
    prismaMock.employees.create.mockResolvedValue({ id: 50, name: 'Telegram User', email: '1@telegram.bot' })
    prismaMock.tickets.findMany.mockResolvedValue([])
    prismaMock.tickets.create.mockResolvedValue({ id: 77, title: 'Тикет' })
    prismaMock.tickets.findUnique.mockResolvedValue({ id: 1, title: 'Тест', created_by: 1, assigned_to: 2 })
    prismaMock.tickets.update.mockResolvedValue({})
    prismaMock.ticket_messages.create.mockResolvedValue({ id: 1 })
  })

  async function getModule() {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    const mod = await import('../telegram.js')
    mod.initTelegram()
    return mod
  }

  const msgHandler = () => mockBotInstance.on.mock.calls.find(c => c[0] === 'message')[1]
  const cbHandler = () => mockBotInstance.on.mock.calls.find(c => c[0] === 'callback_query')[1]

  it('/start привязывает нового пользователя и создаёт employee', async () => {
    await getModule()
    await msgHandler()({
      text: '/start',
      chat: { id: 201 },
      from: { id: 5, first_name: 'Петя', last_name: 'Петров' },
    })
    expect(prismaMock.employees.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: '5@telegram.bot', role: 'agent', name: 'Петя Петров' }),
    })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(201, expect.stringContaining('Бот активирован'))
  })

  it('/link не создаёт дубль, если employee уже есть', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 5 })
    await getModule()
    await msgHandler()({ text: '/link', chat: { id: 202 }, from: { id: 5, first_name: 'Петя' } })
    expect(prismaMock.employees.create).not.toHaveBeenCalled()
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(202, expect.stringContaining('Аккаунт привязан'))
  })

  it('/new создаёт тикет [Telegram] и сообщает номер', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 50 })
    await getModule()
    await msgHandler()({ text: '/new Помогите с VPN', chat: { id: 203 }, from: { id: 5, first_name: 'Петя' } })
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '[Telegram] Помогите с VPN', priority: 'medium', created_by: 50 }),
    })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(203, expect.stringContaining('#77'))
  })

  it('/new без текста — дефолтный заголовок', async () => {
    await getModule()
    await msgHandler()({ text: '/new', chat: { id: 204 }, from: { id: 5, first_name: 'Петя' } })
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '[Telegram] Тикет из Telegram', created_by: 1 }),
    })
  })

  it('/new без userId — тикет создаётся от id 1', async () => {
    await getModule()
    await msgHandler()({ text: '/new Заявка', chat: { id: 205 } })
    expect(prismaMock.tickets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by: 1 }),
    })
  })

  it('/tickets без привязки — просит /link', async () => {
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 206 }, from: { id: 999, first_name: 'X' } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(206, expect.stringContaining('/link'))
  })

  it('/tickets без тикетов — «нет тикетов»', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 5 })
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 207 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(207, expect.stringContaining('нет тикетов'))
  })

  it('/tickets показывает список до 5 тикетов', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 5 })
    prismaMock.tickets.findMany.mockResolvedValue([
      { id: 1, title: 'А', status: 'open', priority: 'medium' },
      { id: 2, title: 'Б', status: 'closed', priority: 'low' },
    ])
    await getModule()
    await msgHandler()({ text: '/tickets', chat: { id: 208 }, from: { id: 5 } })
    expect(prismaMock.tickets.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }))
    const msg = mockBotInstance.sendMessage.mock.calls.find(c => c[0] === 208)?.[1]
    expect(msg).toContain('#1')
    expect(msg).toContain('#2')
  })

  it('/reply на несуществующий тикет — «не найден»', async () => {
    prismaMock.tickets.findUnique.mockResolvedValue(null)
    await getModule()
    await msgHandler()({ text: '/reply 99 текст', chat: { id: 209 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(209, expect.stringContaining('не найден'))
  })

  it('/reply без текста — подсказка', async () => {
    await getModule()
    await msgHandler()({ text: '/reply 5', chat: { id: 210 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(210, expect.stringContaining('/reply <id> <текст>'))
  })

  it('/reply создаёт сообщение и обновляет updated_at', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 5, name: 'Петя' })
    await getModule()
    await msgHandler()({ text: '/reply 1 Привет', chat: { id: 211 }, from: { id: 5 } })
    expect(prismaMock.ticket_messages.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticket_id: 1, sender_id: 5, sender_name: 'Петя', text: 'Привет' }),
    })
    expect(prismaMock.tickets.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { updated_at: expect.any(Date) } })
  })

  it('код #123 текст форвардится в активный тикет', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 5, name: 'Петя' })
    prismaMock.tickets.findMany.mockResolvedValue([{ id: 3 }])
    await getModule()
    await msgHandler()({ text: '#3 Важное дополнение', chat: { id: 212 }, from: { id: 5 } })
    expect(prismaMock.ticket_messages.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticket_id: 3, text: 'Важное дополнение' }),
    })
  })

  it('свободный текст без активных тикетов — предложение /new', async () => {
    prismaMock.employees.findFirst.mockResolvedValueOnce({ id: 5 })
    await getModule()
    await msgHandler()({ text: 'просто текст', chat: { id: 213 }, from: { id: 5 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(213, expect.stringContaining('/new'))
  })

  it('свободный текст без привязки — просит /link', async () => {
    await getModule()
    await msgHandler()({ text: 'просто текст', chat: { id: 214 }, from: { id: 888 } })
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(214, expect.stringContaining('/link'))
  })

  it('callback_query ticket_ отвечает answerCallbackQuery', async () => {
    await getModule()
    cbHandler()({ data: 'ticket_12', id: 'q1', message: { chat: { id: 215 } } })
    expect(mockBotInstance.answerCallbackQuery).toHaveBeenCalledWith('q1', { text: 'Открываю тикет #12' })
  })

  it('callback_query с data не ticket_ — игнорируется', async () => {
    await getModule()
    cbHandler()({ data: 'other', id: 'q2', message: { chat: { id: 216 } } })
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
