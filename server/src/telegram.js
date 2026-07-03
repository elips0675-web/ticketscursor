import TelegramBot from 'node-telegram-bot-api'

let bot = null
const chatIds = new Set()

export function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('Telegram: TELEGRAM_BOT_TOKEN not set, skipping')
    return
  }
  bot = new TelegramBot(token, { polling: true })
  bot.on('message', (msg) => {
    if (msg.text === '/start') {
      chatIds.add(msg.chat.id)
      bot.sendMessage(msg.chat.id, 'Бот активирован. Вы будете получать уведомления о тикетах.')
    }
  })
  console.log('Telegram bot started')
}

export function sendTelegramNotification(text) {
  if (!bot) return
  for (const chatId of chatIds) {
    bot.sendMessage(chatId, text).catch(() => {})
  }
}
