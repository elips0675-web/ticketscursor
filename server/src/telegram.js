import TelegramBot from 'node-telegram-bot-api'
import prisma from './prisma.js'
import logger from './logger.js'

let bot = null
const chatIds = new Set()

export function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set, skipping')
    return
  }
  bot = new TelegramBot(token, { polling: true })

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id
    const text = msg.text || ''
    const userId = msg.from?.id

    if (text === '/start') {
      chatIds.add(chatId)
      if (userId) {
        await linkTelegramUser(chatId, userId, msg.from).catch(() => {})
      }
      bot.sendMessage(chatId, '✅ Бот активирован. Вы будете получать уведомления о тикетах.\n\nКоманды:\n/link — привязать аккаунт\n/new — создать тикет\n/tickets — мои тикеты\n/reply <id> <текст> — ответить на тикет')
      return
    }

    if (text === '/link') {
      if (userId) {
        await linkTelegramUser(chatId, userId, msg.from).catch(() => {})
        bot.sendMessage(chatId, '✅ Аккаунт привязан. Теперь вы будете получать уведомления.')
      }
      return
    }

    if (text === '/new' || text.startsWith('/new ')) {
      const title = text.replace('/new', '').trim() || 'Тикет из Telegram'
      await createTicketFromTelegram(chatId, userId, title).catch(err => {
        logger.error('Create ticket from Telegram error:', err)
        bot.sendMessage(chatId, '❌ Ошибка создания тикета')
      })
      return
    }

    if (text === '/tickets') {
      await listUserTickets(chatId, userId).catch(err => {
        logger.error('List tickets from Telegram error:', err)
        bot.sendMessage(chatId, '❌ Ошибка получения тикетов')
      })
      return
    }

    if (text.startsWith('/reply ')) {
      const parts = text.replace('/reply ', '').split(' ')
      const ticketId = parseInt(parts[0])
      const replyText = parts.slice(1).join(' ')
      if (!ticketId || !replyText) {
        bot.sendMessage(chatId, '❌ Использование: /reply <id> <текст>')
        return
      }
      await replyToTicket(chatId, userId, ticketId, replyText).catch(err => {
        logger.error('Reply from Telegram error:', err)
        bot.sendMessage(chatId, '❌ Ошибка отправки ответа')
      })
      return
    }

    if (text.startsWith('/') || !userId) return

    const ticketMatch = text.match(/^#(\d+)\s+(.*)/)
    if (ticketMatch) {
      const ticketId = parseInt(ticketMatch[1])
      const replyText = ticketMatch[2]
      await replyToTicket(chatId, userId, ticketId, replyText).catch(() => {})
      return
    }

    await forwardMessageToTicket(chatId, userId, text).catch(err => {
      logger.error('Forward message from Telegram error:', err)
    })
  })

  bot.on('callback_query', async (query) => {
    const data = query.data
    const chatId = query.message?.chat.id
    if (!chatId || !data) return

    if (data.startsWith('ticket_')) {
      const ticketId = parseInt(data.replace('ticket_', ''))
      bot.answerCallbackQuery(query.id, { text: `Открываю тикет #${ticketId}` })
    }
  })

  logger.info('Telegram bot started with channel support')
}

async function linkTelegramUser(chatId, telegramUserId, from) {
  const telegramId = String(telegramUserId)
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram User'

  const existing = await prisma.employees.findFirst({
    where: { email: `${telegramId}@telegram.bot` },
    select: { id: true },
  })

  if (!existing) {
    await prisma.employees.create({
      data: {
        name,
        email: `${telegramId}@telegram.bot`,
        password_hash: 'telegram-oauth',
        role: 'agent',
        department: 'Telegram',
        title: 'Telegram Channel',
        is_active: true,
      },
    })
  }
}

async function createTicketFromTelegram(chatId, userId, title) {
  const telegramId = userId ? String(userId) : null
  let employee = null
  if (telegramId) {
    employee = await prisma.employees.findFirst({
      where: { email: `${telegramId}@telegram.bot` },
      select: { id: true },
    })
  }

  const ticket = await prisma.tickets.create({
    data: {
      title: `[Telegram] ${title}`,
      description: `Создано из Telegram chat ${chatId}`,
      priority: 'medium',
      category: 'support',
      created_by: employee?.id || 1,
    },
  })

  bot.sendMessage(chatId, `✅ Тикет #${ticket.id} создан: ${title}\n\nОтветить: /reply ${ticket.id} <текст>`)
  logger.info(`Ticket #${ticket.id} created from Telegram chat ${chatId}`)
}

async function listUserTickets(chatId, userId) {
  if (!userId) {
    bot.sendMessage(chatId, '❌ Сначала привяжите аккаунт: /link')
    return
  }

  const telegramId = String(userId)
  const employee = await prisma.employees.findFirst({
    where: { email: `${telegramId}@telegram.bot` },
    select: { id: true },
  })

  if (!employee) {
    bot.sendMessage(chatId, '❌ Аккаунт не привязан. Используйте /link')
    return
  }

  const tickets = await prisma.tickets.findMany({
    where: {
      OR: [
        { created_by: employee.id },
        { assigned_to: employee.id },
      ],
      deleted_at: null,
    },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { id: true, title: true, status: true, priority: true },
  })

  if (tickets.length === 0) {
    bot.sendMessage(chatId, '📋 У вас нет тикетов')
    return
  }

  const list = tickets.map(t => `#${t.id} [${t.status}] ${t.title} (${t.priority})`).join('\n')
  bot.sendMessage(chatId, `📋 Ваши тикеты:\n\n${list}\n\nОтветить: /reply <id> <текст>`)
}

async function replyToTicket(chatId, userId, ticketId, text) {
  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { id: true, title: true, created_by: true, assigned_to: true },
  })

  if (!ticket) {
    bot.sendMessage(chatId, `❌ Тикет #${ticketId} не найден`)
    return
  }

  const telegramId = userId ? String(userId) : null
  let senderName = 'Telegram User'
  let senderId = 1

  if (telegramId) {
    const employee = await prisma.employees.findFirst({
      where: { email: `${telegramId}@telegram.bot` },
      select: { id: true, name: true },
    })
    if (employee) {
      senderName = employee.name
      senderId = employee.id
    }
  }

  const msg = await prisma.ticket_messages.create({
    data: {
      ticket_id: ticketId,
      sender_id: senderId,
      sender_name: senderName,
      text,
    },
  })

  await prisma.tickets.update({
    where: { id: ticketId },
    data: { updated_at: new Date() },
  })

  bot.sendMessage(chatId, `✅ Ответ на тикет #${ticketId} отправлен`)
  logger.info(`Reply to ticket #${ticketId} from Telegram: ${senderName}`)
}

async function forwardMessageToTicket(chatId, userId, text) {
  const telegramId = userId ? String(userId) : null
  if (!telegramId) return

  const employee = await prisma.employees.findFirst({
    where: { email: `${telegramId}@telegram.bot` },
    select: { id: true },
  })

  if (!employee) {
    bot.sendMessage(chatId, '⚠️ Сначала привяжите аккаунт: /link')
    return
  }

  const tickets = await prisma.tickets.findMany({
    where: {
      OR: [
        { created_by: employee.id },
        { assigned_to: employee.id },
      ],
      status: { notIn: ['closed', 'resolved'] },
      deleted_at: null,
    },
    orderBy: { updated_at: 'desc' },
    take: 1,
    select: { id: true },
  })

  if (tickets.length === 0) {
    bot.sendMessage(chatId, '📋 Нет активных тикетов. Создайте: /new <название>')
    return
  }

  const ticketId = tickets[0].id
  await replyToTicket(chatId, userId, ticketId, text)
}

export function sendTelegramNotification(text) {
  if (!bot) return
  for (const chatId of chatIds) {
    bot.sendMessage(chatId, text).catch(() => {})
  }
}

export function sendTelegramToUser(telegramId, text) {
  if (!bot) return
  bot.sendMessage(telegramId, text).catch(() => {})
}

export function isTelegramBotActive() {
  return bot !== null
}
