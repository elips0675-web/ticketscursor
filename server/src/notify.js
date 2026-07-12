import prisma from './prisma.js'
import { sendTicketNotification } from './email.js'
import { sendTelegramNotification } from './telegram.js'
import { createNotification } from './routes/notifications.js'
import logger from './logger.js'

const STATUS_LABELS = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён', closed: 'Закрыт' }
const PRIORITY_LABELS = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критичный' }

async function retryWithBackoff(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
      logger.warn(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms: ${err.message}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

function safeSend(fn) {
  fn().catch(err => logger.error(`Notification send failed: ${err.message}`))
}

function safeNotify(promise) {
  promise.catch(err => logger.error(`Notify failed: ${err.message}`))
}

async function getTicketWithUsers(ticketId) {
  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    include: {
      created_by_employee: { select: { id: true, name: true, email: true } },
      assigned_to_employee: { select: { id: true, name: true, email: true } },
    },
  })
  if (!ticket) return null
  return {
    ...ticket,
    creatorId: ticket.created_by_employee?.id || ticket.created_by,
    creatorName: ticket.created_by_employee?.name,
    creatorEmail: ticket.created_by_employee?.email,
    assigneeId: ticket.assigned_to_employee?.id,
    assigneeName: ticket.assigned_to_employee?.name,
    assigneeEmail: ticket.assigned_to_employee?.email,
    created_by_employee: undefined,
    assigned_to_employee: undefined,
  }
}

async function getTicketParticipants(ticketId, excludeUserId) {
  const rows = await prisma.ticket_messages.findMany({
    where: { ticket_id: ticketId, sender_id: { not: excludeUserId } },
    distinct: ['sender_id'],
    select: { sender_id: true },
  })
  return rows.map(r => r.sender_id)
}

export async function notifyTicketCreated(ticketId, actorName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const tag = `#${ticketId}: ${t.title}`
  safeNotify(createNotification({
    userId: t.creatorId, type: 'ticket_created',
    title: 'Тикет создан', body: t.title,
    link: `/tickets/${ticketId}`,
  }))
  sendTelegramNotification(`🆕 Новый тикет ${tag}\nПриоритет: ${PRIORITY_LABELS[t.priority] || t.priority}\nКатегория: ${t.category}`)
  if (t.creatorEmail) {
    safeSend(() => retryWithBackoff(() => sendTicketNotification({
      to: t.creatorEmail,
      subject: `Тикет #${ticketId} создан: ${t.title}`,
      text: `Ваш тикет "${t.title}" (#${ticketId}) создан.\nСтатус: Открыт\nПриоритет: ${PRIORITY_LABELS[t.priority] || t.priority}\n\nService Desk`,
    })))
  }
}

export async function notifyStatusChanged(ticketId, oldStatus, newStatus, actorName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const oldLabel = STATUS_LABELS[oldStatus] || oldStatus
  const newLabel = STATUS_LABELS[newStatus] || newStatus
  const tag = `#${ticketId}: ${t.title}`

  const targets = [t.creatorId]
  if (t.assigneeId && !targets.includes(t.assigneeId)) targets.push(t.assigneeId)
  for (const userId of targets) {
    safeNotify(createNotification({
      userId, type: 'ticket_status',
      title: `Статус изменён: ${newLabel}`,
      body: t.title,
      link: `/tickets/${ticketId}`,
    }))
  }
  sendTelegramNotification(`📋 Статус тикета ${tag}\n${oldLabel} → ${newLabel}\nИзменил: ${actorName}`)

  const emailTargets = []
  if (t.creatorEmail && !emailTargets.includes(t.creatorId)) emailTargets.push({ email: t.creatorEmail, name: t.creatorName })
  if (t.assigneeEmail && t.assigneeId !== t.creatorId) emailTargets.push({ email: t.assigneeEmail, name: t.assigneeName })
  for (const et of emailTargets) {
    safeSend(() => retryWithBackoff(() => sendTicketNotification({
      to: et.email,
      subject: `Статус тикета ${tag}: ${newLabel}`,
      text: `Тикет "${t.title}" (#${ticketId})\nСтатус: ${oldLabel} → ${newLabel}\n\nService Desk`,
    })))
  }
}

export async function notifyPriorityChanged(ticketId, oldPriority, newPriority, actorName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const tag = `#${ticketId}: ${t.title}`
  sendTelegramNotification(`⚡ Приоритет тикета ${tag}\n${PRIORITY_LABELS[oldPriority] || oldPriority} → ${PRIORITY_LABELS[newPriority] || newPriority}`)
}

export async function notifyTicketAssigned(ticketId, assigneeId, assignedByName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  if (!assigneeId || assigneeId === t.creatorId) return

  safeNotify(createNotification({
    userId: assigneeId, type: 'ticket_assigned',
    title: 'Назначен тикет', body: t.title,
    link: `/tickets/${ticketId}`,
  }))
  sendTelegramNotification(`👤 Тикет #${ticketId} назначен на пользователя\n"${t.title}"\nНазначил: ${assignedByName}`)

  if (t.assigneeEmail) {
    safeSend(() => retryWithBackoff(() => sendTicketNotification({
      to: t.assigneeEmail,
      subject: `Тикет #${ticketId} назначен на вас: ${t.title}`,
      text: `Тикет "${t.title}" (#${ticketId}) назначен на вас.\nСтатус: ${STATUS_LABELS[t.status] || t.status}\nПриоритет: ${PRIORITY_LABELS[t.priority] || t.priority}\n\nService Desk`,
    })))
  }
}

export async function notifyTicketMessage(ticketId, senderId, senderName, text) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const participantIds = await getTicketParticipants(ticketId, senderId)
  const targets = new Set([t.creatorId, t.assigneeId, ...participantIds].filter(Boolean))

  for (const userId of targets) {
    if (userId === senderId) continue
    safeNotify(createNotification({
      userId, type: 'ticket_message',
      title: senderName || 'Пользователь',
      body: text,
      link: `/tickets/${ticketId}`,
    }))
  }

  sendTelegramNotification(`💬 Новое сообщение в тикете #${ticketId}: ${t.title}\n${senderName}: ${text.slice(0, 200)}`)
}

export async function notifySlaBreached(ticketId) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const now = Date.now()
  const dueAt = t.due_at ? new Date(t.due_at).getTime() : null
  if (!dueAt || dueAt > now) return

  const admins = await prisma.employees.findMany({
    where: {
      is_active: true,
      role: { in: ['super_admin', 'admin', 'senior_agent'] },
    },
    select: { id: true, email: true, name: true },
  })

  const targets = new Set([t.creatorId, t.assigneeId].filter(Boolean))
  for (const a of admins) targets.add(a.id)

  const recentCutoff = new Date(now - 24 * 60 * 60 * 1000)
  for (const userId of targets) {
    const alreadyNotified = await prisma.notifications.findFirst({
      where: {
        user_id: userId,
        type: 'ticket_sla_overdue',
        link: `/tickets/${ticketId}`,
        created_at: { gte: recentCutoff },
      },
      select: { id: true },
    })
    if (alreadyNotified) continue
    await createNotification({
      userId,
      type: 'ticket_sla_overdue',
      title: 'Нарушение SLA',
      body: `Тикет #${ticketId} просрочен по SLA`,
      link: `/tickets/${ticketId}`,
    })
  }

  const adminEmails = admins
    .map(a => a.email)
    .filter(Boolean)
  for (const email of adminEmails) {
    safeSend(() => retryWithBackoff(() => sendTicketNotification({
      to: email,
      subject: `SLA просрочка: тикет #${ticketId}`,
      text: `Тикет "${t.title}" (#${ticketId}) просрочен по SLA.\nСрок реакции истёк: ${new Date(t.due_at).toLocaleString('ru-RU')}\n\nService Desk`,
    })))
  }

  sendTelegramNotification(`🚨 SLA просрочка\nТикет #${ticketId}: ${t.title}\nСрок реакции истёк: ${new Date(t.due_at).toLocaleString('ru-RU')}`)
}
