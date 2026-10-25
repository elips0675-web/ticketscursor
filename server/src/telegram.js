import TelegramBot from 'node-telegram-bot-api'
import prisma from './prisma.js'
import logger from './logger.js'
import { isFeatureEnabled } from './feature-flags.js'

let bot = null
const chatIds = new Set()

const TELEGRAM_EMAIL_DOMAIN = '@telegram.bot'

async function contactsEnabled() {
  try {
    return await isFeatureEnabled('telegram_contacts')
  } catch {
    return true
  }
}

export function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set, skipping')
    return
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

  if (webhookUrl && webhookSecret) {
    bot = new TelegramBot(token, { polling: false })
    bot.setWebhook(webhookUrl, { secret_token: webhookSecret })
      .then(() => logger.info(`Telegram webhook set: ${webhookUrl}`))
      .catch(err => logger.error('Telegram setWebhook error:', err))
    return
  }

  bot = new TelegramBot(token, { polling: true })
  bot.on('message', (msg) => handleMessage(msg).catch(err => logger.error('Telegram message error:', err)))
  bot.on('callback_query', (query) => handleCallbackQuery(query).catch(err => logger.error('Telegram callback error:', err)))
  logger.info('Telegram bot started with channel support')
}

export async function handleTelegramUpdate(update) {
  if (!bot) return { ok: false, reason: 'bot_inactive' }
  if (update.message) {
    await handleMessage(update.message)
    return { ok: true, kind: 'message' }
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    return { ok: true, kind: 'callback_query' }
  }
  return { ok: true, kind: 'ignored' }
}

async function handleMessage(msg) {
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
    await createTicketFromTelegram(chatId, userId, title, msg.from).catch(err => {
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
}

async function handleCallbackQuery(query) {
  const data = query.data
  const chatId = query.message?.chat.id
  if (!chatId || !data) return

  if (data.startsWith('ticket_')) {
    const ticketId = parseInt(data.replace('ticket_', ''))
    bot.answerCallbackQuery(query.id, { text: `Открываю тикет #${ticketId}` })
  }
}

async function linkTelegramUser(chatId, telegramUserId, from) {
  const telegramId = String(telegramUserId)
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram User'

  if (await contactsEnabled()) {
    await prisma.telegram_contacts.upsert({
      where: { telegram_id: BigInt(telegramId) },
      create: {
        telegram_id: BigInt(telegramId),
        chat_id: BigInt(chatId),
        username: from.username || null,
        name,
      },
      update: {
        chat_id: BigInt(chatId),
        username: from.username || null,
        name,
      },
    })
    return
  }

  const existing = await prisma.employees.findFirst({
    where: { email: `${telegramId}${TELEGRAM_EMAIL_DOMAIN}` },
    select: { id: true },
  })

  if (!existing) {
    await prisma.employees.create({
      data: {
        name,
        email: `${telegramId}${TELEGRAM_EMAIL_DOMAIN}`,
        password_hash: 'telegram-oauth',
        role: 'requester',
        department: 'Telegram',
        title: 'Telegram User',
        is_active: true,
      },
    })
  }
}

async function getTelegramIdentity(telegramId) {
  if (!telegramId) return { contact: null, employee: null }

  if (await contactsEnabled()) {
    const contact = await prisma.telegram_contacts.findUnique({
      where: { telegram_id: BigInt(telegramId) },
      select: { id: true, employee_id: true, name: true },
    })
    if (!contact || !contact.employee_id) return { contact, employee: null }

    const employee = await prisma.employees.findUnique({
      where: { id: contact.employee_id },
      select: { id: true, name: true },
    })
    return { contact, employee }
  }

  const employee = await prisma.employees.findFirst({
    where: { email: `${telegramId}${TELEGRAM_EMAIL_DOMAIN}` },
    select: { id: true, name: true },
  })
  return { contact: null, employee }
}

async function ensureTelegramEmployee(telegramId, chatId, from) {
  const { contact, employee } = await getTelegramIdentity(telegramId)
  if (employee) return employee

  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username || contact?.name || 'Telegram User'
  const data = {
    name,
    email: `${telegramId}${TELEGRAM_EMAIL_DOMAIN}`,
    password_hash: 'telegram-oauth',
    role: 'requester',
    department: 'Telegram',
    title: 'Telegram User',
    is_active: true,
  }

  if (!(await contactsEnabled())) {
    return prisma.employees.create({ data, select: { id: true, name: true } })
  }

  let contactId = contact?.id
  if (!contactId) {
    const createdContact = await prisma.telegram_contacts.create({
      data: {
        telegram_id: BigInt(telegramId),
        chat_id: chatId ? BigInt(chatId) : null,
        username: from?.username || null,
        name,
      },
      select: { id: true },
    })
    contactId = createdContact.id
  }

  const existing = await prisma.employees.findFirst({
    where: { email: `${telegramId}${TELEGRAM_EMAIL_DOMAIN}` },
    select: { id: true, name: true },
  })
  if (existing) {
    await prisma.telegram_contacts.update({
      where: { id: contactId },
      data: { employee_id: existing.id },
    })
    return existing
  }

  const created = await prisma.employees.create({ data, select: { id: true, name: true } })
  await prisma.telegram_contacts.update({
    where: { id: contactId },
    data: { employee_id: created.id },
  })
  return created
}

async function createTicketFromTelegram(chatId, userId, title, from) {
  if (!userId) {
    bot.sendMessage(chatId, '❌ Не удалось определить пользователя Telegram')
    return
  }

  const employee = await ensureTelegramEmployee(String(userId), chatId, from)

  const ticket = await prisma.tickets.create({
    data: {
      title: `[Telegram] ${title}`,
      description: `Создано из Telegram chat ${chatId}`,
      priority: 'medium',
      category: 'support',
      created_by: employee.id,
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

  const { contact, employee } = await getTelegramIdentity(String(userId))

  if (!employee) {
    if (contact) {
      bot.sendMessage(chatId, '📋 У вас нет тикетов. Создайте: /new <название>')
    } else {
      bot.sendMessage(chatId, '❌ Аккаунт не привязан. Используйте /link')
    }
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

  const { contact, employee } = userId ? await getTelegramIdentity(String(userId)) : { contact: null, employee: null }

  if (!employee) {
    if (contact) {
      bot.sendMessage(chatId, '❌ Сначала создайте тикет: /new <название>')
    } else {
      bot.sendMessage(chatId, '❌ Аккаунт не привязан. Используйте /link')
    }
    return
  }

  if (ticket.created_by !== employee.id && ticket.assigned_to !== employee.id) {
    bot.sendMessage(chatId, `❌ Нет доступа к тикету #${ticketId}`)
    return
  }

  await prisma.ticket_messages.create({
    data: {
      ticket_id: ticketId,
      sender_id: employee.id,
      sender_name: employee.name,
      text,
    },
  })

  await prisma.tickets.update({
    where: { id: ticketId },
    data: { updated_at: new Date() },
  })

  bot.sendMessage(chatId, `✅ Ответ на тикет #${ticketId} отправлен`)
  logger.info(`Reply to ticket #${ticketId} from Telegram: ${employee.name}`)
}

async function forwardMessageToTicket(chatId, userId, text) {
  if (!userId) return

  const { contact, employee } = await getTelegramIdentity(String(userId))

  if (!employee) {
    if (contact) {
      bot.sendMessage(chatId, '📋 Нет активных тикетов. Создайте: /new <название>')
    } else {
      bot.sendMessage(chatId, '⚠️ Сначала привяжите аккаунт: /link')
    }
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

export async function notifyTelegramRequester(ticketId, text, senderId) {
  if (!bot) return false
  if (!(await isFeatureEnabled('telegram_two_way'))) return false

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { created_by: true },
  })
  if (!ticket?.created_by || ticket.created_by === senderId) return false

  let chatId
  if (await contactsEnabled()) {
    const contact = await prisma.telegram_contacts.findFirst({
      where: { employee_id: ticket.created_by },
      select: { chat_id: true, telegram_id: true },
    })
    if (!contact) return false
    chatId = contact.chat_id ?? contact.telegram_id
  } else {
    const employee = await prisma.employees.findUnique({
      where: { id: ticket.created_by },
      select: { email: true },
    })
    if (!employee?.email?.endsWith(TELEGRAM_EMAIL_DOMAIN)) return false
    chatId = employee.email.split('@')[0]
  }

  if (chatId == null) return false
  sendTelegramToUser(String(chatId), `💬 Ответ по тикету #${ticketId}\n${text.slice(0, 500)}`)
  return true
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
