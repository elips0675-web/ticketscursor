import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import prisma from '../prisma.js'
import logger from '../logger.js'
import { getSettings } from '../settings.js'
import { sendTicketNotification } from '../email.js'

const POLL_INTERVAL = 2 * 60 * 1000
let pollingTimer = null
let isRunning = false

function getImapConfig(settings) {
  const host = settings.IMAP_HOST || process.env.IMAP_HOST
  const port = Number(settings.IMAP_PORT || process.env.IMAP_PORT) || 993
  const user = settings.IMAP_USER || process.env.IMAP_USER
  const pass = settings.IMAP_PASS || process.env.IMAP_PASS
  if (!host || !user || !pass) return null
  return {
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  }
}

function extractTextBody(parsed) {
  if (parsed.text) return parsed.text.trim()
  if (parsed.html) {
    return parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

function extractTicketReference(subject) {
  const match = subject?.match(/\[(?:Ticket|тикет)\s*#?(\d+)\]/i)
  return match ? Number(match[1]) : null
}

function stripTicketReference(subject) {
  return subject?.replace(/\s*\[(?:Ticket|тикет)\s*#\d+\]\s*/gi, '').trim() || subject || ''
}

async function findTicketByEmailMessageId(messageId) {
  if (!messageId) return null
  const ticket = await prisma.tickets.findFirst({
    where: { email_message_id: messageId, deleted_at: null },
    select: { id: true },
  })
  return ticket ? ticket.id : null
}

async function findTicketBySubject(subject) {
  const ticketId = extractTicketReference(subject)
  if (!ticketId) return null
  const ticket = await prisma.tickets.findFirst({
    where: { id: ticketId, deleted_at: null },
    select: { id: true },
  })
  return ticket ? ticket.id : null
}

async function findOrCreateRequester(fromEmail, fromName) {
  if (!fromEmail) return null
  const existing = await prisma.employees.findFirst({
    where: { email: fromEmail.toLowerCase() },
    select: { id: true },
  })
  if (existing) return existing.id
  const emp = await prisma.employees.create({
    data: {
      name: fromName || fromEmail.split('@')[0],
      email: fromEmail.toLowerCase(),
      role: 'agent',
      is_active: true,
    },
  })
  return emp.id
}

async function processEmail(parsed, client) {
  const fromEmail = parsed.from?.text || ''
  const fromName = parsed.from?.value?.[0]?.name || ''
  const rawSubject = parsed.subject || ''
  const body = extractTextBody(parsed)
  const messageId = parsed.messageId || parsed.headers?.get('message-id')
  const inReplyTo = parsed.inReplyTo || parsed.headers?.get('in-reply-to')

  if (!body && !rawSubject) {
    logger.warn('IMAP: empty email, skipping')
    return
  }
  const subject = rawSubject || '(No subject)'

  const requesterId = await findOrCreateRequester(fromEmail, fromName)

  const ticketIdFromReply = await findTicketByEmailMessageId(inReplyTo)
  const ticketIdFromSubject = await findTicketBySubject(subject)
  const existingTicketId = ticketIdFromReply || ticketIdFromSubject

  if (existingTicketId) {
    await prisma.ticket_messages.create({
      data: {
        ticket_id: existingTicketId,
        user_id: requesterId,
        text: body || '(empty message)',
        is_internal: false,
      },
    })
    logger.info(`IMAP: reply added to ticket #${existingTicketId} from ${fromEmail}`)
    await client.setFlags(parsed.uid, ['\\Seen']).catch(() => {})
    return
  }

  const ticket = await prisma.tickets.create({
    data: {
      title: stripTicketReference(subject),
      description: body || '',
      status: 'open',
      priority: 'medium',
      category: 'support',
      created_by: requesterId,
      email_message_id: messageId || null,
      tags: ['email'],
    },
  })

  if (messageId) {
    await prisma.tickets.update({
      where: { id: ticket.id },
      data: { email_message_id: messageId },
    })
  }

  const db = await getSettings().catch(() => ({}))
  const companyName = db.COMPANY_NAME || 'Service Desk'
  const autoReplyTo = fromEmail
  if (autoReplyTo) {
    sendTicketNotification({
      to: autoReplyTo,
      subject: `[Ticket #${ticket.id}] ${stripTicketReference(subject)}`,
      text: [
        `Спасибо за обращение!`,
        ``,
        `Ваш тикет создан: #${ticket.id}`,
        `Тема: ${stripTicketReference(subject)}`,
        ``,
        `Для ответа на этот тикет просто ответьте на это письмо.`,
        ``,
        `— ${companyName}`,
      ].join('\n'),
    }).catch(() => {})
  }

  logger.info(`IMAP: new ticket #${ticket.id} from ${fromEmail}: ${subject}`)
  await client.setFlags(parsed.uid, ['\\Seen']).catch(() => {})
}

async function pollOnce() {
  if (isRunning) return
  const settings = await getSettings().catch(() => ({}))
  const config = getImapConfig(settings)
  if (!config) return

  isRunning = true
  let client
  try {
    client = new ImapFlow(config)
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      for await (const message of client.fetch({ unseen: true }, { source: true, uid: true, envelope: true, headers: true })) {
        try {
          const parsed = await simpleParser(message.source)
          parsed.uid = message.uid
          await processEmail(parsed, client)
        } catch (err) {
          logger.error('IMAP: failed to process email:', err.message)
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (err) {
    logger.error('IMAP connection error:', err.message)
    if (client) {
      client.logout().catch(() => {})
    }
  } finally {
    isRunning = false
  }
}

export function startImapPolling() {
  if (pollingTimer) return
  const settings = getSettings()
  settings.then(s => {
    const config = getImapConfig(s)
    if (!config) {
      logger.info('IMAP polling not started (no IMAP config)')
      return
    }
    logger.info(`IMAP polling started (every ${POLL_INTERVAL / 1000}s)`)
    pollOnce()
    pollingTimer = setInterval(pollOnce, POLL_INTERVAL)
  }).catch(() => {})
}

export function stopImapPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

export async function testImapConnection() {
  const settings = await getSettings().catch(() => ({}))
  const config = getImapConfig(settings)
  if (!config) throw new Error('IMAP not configured')
  const client = new ImapFlow(config)
  try {
    await client.connect()
    const mailbox = await client.getMailboxLock('INBOX')
    mailbox.release()
    await client.logout()
    return { success: true, message: 'Connected successfully' }
  } catch (err) {
    await client.logout().catch(() => {})
    throw new Error(`Connection failed: ${err.message}`, { cause: err })
  }
}

export async function getEmailStats() {
  const settings = await getSettings().catch(() => ({}))
  const config = getImapConfig(settings)
  return {
    configured: !!config,
    polling: !!pollingTimer,
    imapHost: config?.host || null,
  }
}

export { getImapConfig, extractTicketReference, stripTicketReference }
