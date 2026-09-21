import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockBotInstance = vi.hoisted(() => ({
  on: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
}))
const mockTelegramBotCtor = vi.hoisted(() => vi.fn(function ctor() { return mockBotInstance }))

vi.mock('node-telegram-bot-api', () => ({ default: mockTelegramBotCtor }))

describe('telegram.js', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TELEGRAM_BOT_TOKEN
    mockBotInstance.on.mockClear()
    mockBotInstance.sendMessage.mockClear()
    mockTelegramBotCtor.mockClear()
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
