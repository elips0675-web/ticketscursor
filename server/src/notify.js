import prisma from './prisma.js'
import { sendTicketNotification } from './email.js'
import { sendTelegramNotification } from './telegram.js'
import { createNotification } from './routes/notifications.js'
import { getSettings } from './settings.js'
import logger from './logger.js'
import webpush from 'web-push'
import { allowedUserIds } from './notification-prefs.js'

const STATUS_LABELS = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён', closed: 'Закрыт' }
const PRIORITY_LABELS = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критичный' }

const PUSH_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const PUSH_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
if (PUSH_PUBLIC_KEY && PUSH_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@servicedesk.local',
      PUSH_PUBLIC_KEY,
      PUSH_PRIVATE_KEY,
    )
  } catch (e) {
    logger.warn(`VAPID setup failed: ${e.message}`)
  }
}
const PUSH_ICON = '/icon.svg'

const DEFAULT_TEMPLATES = {
  ticketCreatedSubject: 'Тикет #{{ticketId}} создан: {{ticketTitle}}',
  ticketCreatedBody: 'Ваш тикет "{{ticketTitle}}" (#{{ticketId}}) создан.\nСтатус: Открыт\nПриоритет: {{priority}}\n\n{{companyName}}',
  ticketStatusSubject: 'Статус тикета #{{ticketId}}: {{newStatus}}',
  ticketStatusBody: 'Тикет "{{ticketTitle}}" (#{{ticketId}})\nСтатус: {{oldStatus}} → {{newStatus}}\n\n{{companyName}}',
  ticketAssignedSubject: 'Тикет #{{ticketId}} назначен на вас: {{ticketTitle}}',
  ticketAssignedBody: 'Тикет "{{ticketTitle}}" (#{{ticketId}}) назначен на вас.\nСтатус: {{status}}\nПриоритет: {{priority}}\n\n{{companyName}}',
  slaBreachedSubject: 'SLA просрочка: тикет #{{ticketId}}',
  slaBreachedBody: 'Тикет "{{ticketTitle}}" (#{{ticketId}}) просрочен по SLA.\nСрок реакции истёк: {{dueAt}}\n\n{{companyName}}',
}

function replaceVariables(template, vars) {
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val ?? '')
  }
  return result
}

let templateCache = null
let templateCacheTime = 0

async function getTemplates() {
  if (templateCache && Date.now() - templateCacheTime < 60000) return templateCache
  try {
    const settings = await getSettings()
    const stored = settings.EMAIL_TEMPLATES ? JSON.parse(settings.EMAIL_TEMPLATES) : {}
    templateCache = { ...DEFAULT_TEMPLATES, ...stored }
    templateCacheTime = Date.now()
  } catch {
    templateCache = { ...DEFAULT_TEMPLATES }
  }
  return templateCache
}

async function companyName() {
  const settings = await getSettings()
  return settings.COMPANY_NAME || 'Service Desk'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('ru-RU')
}

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

/** Push-доставка по подпискам пользователей, чей канал push включён для события. */
async function sendPushToUsers(userIds, eventType, payload) {
  try {
    const ids = await allowedUserIds(userIds, eventType, 'push')
    if (ids.length === 0) return
    const subs = await prisma.push_subscriptions.findMany({
      where: { user_id: { in: ids } },
      select: { user_id: true, subscription_json: true },
    })
    await Promise.allSettled(subs.map((row) => (async () => {
      try {
        await webpush.sendNotification(
          JSON.parse(row.subscription_json),
          JSON.stringify({ ...payload, icon: PUSH_ICON }),
        )
      } catch (err) {
        if (err && (err.statusCode === 410 || err.statusCode === 404)) {
          try { await prisma.push_subscriptions.deleteMany({ where: { user_id: row.user_id } }) } catch { /* noop */ }
        }
      }
    })()))
  } catch (err) {
    logger.error(`Push notification failed: ${err.message}`)
  }
}

function sendEmail(to, subject, text) {
  safeSend(() => retryWithBackoff(() => sendTicketNotification({ to, subject, text })))
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
    where: { ticket_id: ticketId, sender_id: { not: excludeUserId }, deleted_at: null },
    distinct: ['sender_id'],
    select: { sender_id: true },
  })
  return rows.map(r => r.sender_id)
}

/** Этап 64: id подписчиков (watchers) тикета — для уведомлений об изменениях. */
async function getTicketWatcherIds(ticketId) {
  try {
    const rows = await prisma.ticket_watchers.findMany({
      where: { ticket_id: ticketId },
      select: { employee_id: true },
    })
    return rows.map(r => r.employee_id)
  } catch {
    return []
  }
}

function mergeWatcherTargets(targets, watcherIds) {
  for (const id of watcherIds) {
    if (id && !targets.includes(id)) targets.push(id)
  }
}

export async function notifyTicketCreated(ticketId, _actorName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const tag = `#${ticketId}: ${t.title}`
  const inAppIds = await allowedUserIds([t.creatorId], 'ticket_created', 'in_app')
  if (inAppIds.includes(t.creatorId)) {
    safeNotify(createNotification({
      userId: t.creatorId, type: 'ticket_created',
      title: 'Тикет создан', body: t.title,
      link: `/tickets/${ticketId}`,
    }))
  }
  sendTelegramNotification(`🆕 Новый тикет ${tag}\nПриоритет: ${PRIORITY_LABELS[t.priority] || t.priority}\nКатегория: ${t.category}`)
  const emailIds = await allowedUserIds([t.creatorId], 'ticket_created', 'email')
  if (t.creatorEmail && emailIds.includes(t.creatorId)) {
    const templates = await getTemplates()
    const cn = await companyName()
    const vars = { ticketId: String(ticketId), ticketTitle: t.title, priority: PRIORITY_LABELS[t.priority] || t.priority, companyName: cn, userName: t.creatorName || '' }
    sendEmail(t.creatorEmail,
      replaceVariables(templates.ticketCreatedSubject, vars),
      replaceVariables(templates.ticketCreatedBody, vars))
  }
  sendPushToUsers([t.creatorId], 'ticket_created', { title: 'Тикет создан', body: t.title, url: `/tickets/${ticketId}` })
}

export async function notifyStatusChanged(ticketId, oldStatus, newStatus, actorName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const oldLabel = STATUS_LABELS[oldStatus] || oldStatus
  const newLabel = STATUS_LABELS[newStatus] || newStatus
  const tag = `#${ticketId}: ${t.title}`

  const targets = [t.creatorId]
  if (t.assigneeId && !targets.includes(t.assigneeId)) targets.push(t.assigneeId)
  const watcherIds = await getTicketWatcherIds(ticketId)
  mergeWatcherTargets(targets, watcherIds)
  const inAppIds = await allowedUserIds(targets, 'ticket_status', 'in_app')
  const emailIds = new Set(await allowedUserIds(targets, 'ticket_status', 'email'))
  for (const userId of targets) {
    if (!inAppIds.includes(userId)) continue
    safeNotify(createNotification({
      userId, type: 'ticket_status',
      title: `Статус изменён: ${newLabel}`,
      body: t.title,
      link: `/tickets/${ticketId}`,
    }))
  }
  sendTelegramNotification(`📋 Статус тикета ${tag}\n${oldLabel} → ${newLabel}\nИзменил: ${actorName}`)

  const emailTargets = []
  if (t.creatorEmail && emailIds.has(t.creatorId)) emailTargets.push({ email: t.creatorEmail, name: t.creatorName })
  if (t.assigneeEmail && t.assigneeId !== t.creatorId && emailIds.has(t.assigneeId)) emailTargets.push({ email: t.assigneeEmail, name: t.assigneeName })
  const templates = await getTemplates()
  const cn = await companyName()
  for (const et of emailTargets) {
    const vars = { ticketId: String(ticketId), ticketTitle: t.title, oldStatus: oldLabel, newStatus: newLabel, companyName: cn, userName: et.name || '' }
    sendEmail(et.email,
      replaceVariables(templates.ticketStatusSubject, vars),
      replaceVariables(templates.ticketStatusBody, vars))
  }
  sendPushToUsers(targets, 'ticket_status', { title: `Статус изменён: ${newLabel}`, body: t.title, url: `/tickets/${ticketId}` })
}

const PRIORITY_BODY_TEMPLATE = 'Приоритет тикета "{{ticketTitle}}" (#{{ticketId}}) изменён.\n{{oldPriority}} → {{newPriority}}\n\n{{companyName}}'
const PRIORITY_SUBJECT_TEMPLATE = 'Приоритет #{{ticketId}}: {{newPriority}}'

export async function notifyPriorityChanged(ticketId, oldPriority, newPriority, _actorName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const oldLabel = PRIORITY_LABELS[oldPriority] || oldPriority
  const newLabel = PRIORITY_LABELS[newPriority] || newPriority
  const tag = `#${ticketId}: ${t.title}`

  const targets = [t.creatorId]
  if (t.assigneeId && !targets.includes(t.assigneeId)) targets.push(t.assigneeId)
  const watcherIds = await getTicketWatcherIds(ticketId)
  mergeWatcherTargets(targets, watcherIds)
  const inAppIds = await allowedUserIds(targets, 'ticket_priority', 'in_app')
  const emailIds = new Set(await allowedUserIds(targets, 'ticket_priority', 'email'))
  for (const userId of targets) {
    if (!inAppIds.includes(userId)) continue
    safeNotify(createNotification({
      userId, type: 'ticket_priority',
      title: `Приоритет изменён: ${newLabel}`,
      body: t.title,
      link: `/tickets/${ticketId}`,
    }))
  }
  sendTelegramNotification(`⚡ Приоритет тикета ${tag}\n${oldLabel} → ${newLabel}`)

  const emailTargets = []
  if (t.creatorEmail && emailIds.has(t.creatorId)) emailTargets.push({ email: t.creatorEmail, name: t.creatorName })
  if (t.assigneeEmail && t.assigneeId !== t.creatorId && emailIds.has(t.assigneeId)) emailTargets.push({ email: t.assigneeEmail, name: t.assigneeName })
  const cn = await companyName()
  for (const et of emailTargets) {
    const vars = { ticketId: String(ticketId), ticketTitle: t.title, oldPriority: oldLabel, newPriority: newLabel, companyName: cn }
    sendEmail(et.email,
      replaceVariables(PRIORITY_SUBJECT_TEMPLATE, vars),
      replaceVariables(PRIORITY_BODY_TEMPLATE, vars))
  }
  sendPushToUsers(targets, 'ticket_priority', { title: `Приоритет изменён: ${newLabel}`, body: t.title, url: `/tickets/${ticketId}` })
}

export async function notifyTicketAssigned(ticketId, assigneeId, assignedByName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  if (!assigneeId || assigneeId === t.creatorId) return

  const inAppIds = await allowedUserIds([assigneeId], 'ticket_assigned', 'in_app')
  if (inAppIds.includes(assigneeId)) {
    safeNotify(createNotification({
      userId: assigneeId, type: 'ticket_assigned',
      title: 'Назначен тикет', body: t.title,
      link: `/tickets/${ticketId}`,
    }))
  }
  sendTelegramNotification(`👤 Тикет #${ticketId} назначен на пользователя\n"${t.title}"\nНазначил: ${assignedByName}`)

  const emailIds = await allowedUserIds([assigneeId], 'ticket_assigned', 'email')
  if (t.assigneeEmail && emailIds.includes(assigneeId)) {
    const templates = await getTemplates()
    const cn = await companyName()
    const vars = { ticketId: String(ticketId), ticketTitle: t.title, status: STATUS_LABELS[t.status] || t.status, priority: PRIORITY_LABELS[t.priority] || t.priority, companyName: cn, userName: t.assigneeName || '' }
    sendEmail(t.assigneeEmail,
      replaceVariables(templates.ticketAssignedSubject, vars),
      replaceVariables(templates.ticketAssignedBody, vars))
  }
  sendPushToUsers([assigneeId], 'ticket_assigned', { title: 'Назначен тикет', body: t.title, url: `/tickets/${ticketId}` })
}

const MESSAGE_SUBJECT_TEMPLATE = 'Новое сообщение в тикете #{{ticketId}}: {{ticketTitle}}'
const MESSAGE_BODY_TEMPLATE = '{{senderName}} написал в тикете "{{ticketTitle}}" (#{{ticketId}}):\n\n{{messageText}}\n\n{{companyName}}'

export async function notifyTicketMessage(ticketId, senderId, senderName, text) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const participantIds = await getTicketParticipants(ticketId, senderId)
  const targets = new Set([t.creatorId, t.assigneeId, ...participantIds].filter(Boolean))
  const watcherIds = await getTicketWatcherIds(ticketId)
  for (const id of watcherIds) if (id) targets.add(id)
  const targetList = [...targets]
  const inAppIds = await allowedUserIds(targetList, 'ticket_message', 'in_app')
  const emailIds = new Set(await allowedUserIds(targetList, 'ticket_message', 'email'))

  const toNotify = []
  for (const userId of targets) {
    if (userId === senderId) continue
    if (!inAppIds.includes(userId)) continue
    toNotify.push(userId)
    safeNotify(createNotification({
      userId, type: 'ticket_message',
      title: senderName || 'Пользователь',
      body: text,
      link: `/tickets/${ticketId}`,
    }))
  }

  sendTelegramNotification(`💬 Новое сообщение в тикете #${ticketId}: ${t.title}\n${senderName}: ${text.slice(0, 200)}`)

  const emailRecipients = []
  if (t.creatorEmail && t.creatorId !== senderId && emailIds.has(t.creatorId)) {
    emailRecipients.push({ email: t.creatorEmail, name: t.creatorName })
  }
  if (t.assigneeEmail && t.assigneeId !== senderId && t.assigneeId && emailIds.has(t.assigneeId)) {
    emailRecipients.push({ email: t.assigneeEmail, name: t.assigneeName })
  }
  if (emailRecipients.length > 0) {
    const cn = await companyName()
    for (const et of emailRecipients) {
      const vars = { ticketId: String(ticketId), ticketTitle: t.title, senderName: senderName || 'Пользователь', messageText: text, companyName: cn }
      sendEmail(et.email,
        replaceVariables(MESSAGE_SUBJECT_TEMPLATE, vars),
        replaceVariables(MESSAGE_BODY_TEMPLATE, vars))
    }
  }
  sendPushToUsers(targetList.filter((id) => id !== senderId), 'ticket_message', {
    title: senderName || 'Пользователь',
    body: text,
    url: `/tickets/${ticketId}`,
  })
}

export async function notifyTicketMention(ticketId, mentionedUserIds, senderId, senderName) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const inAppIds = await allowedUserIds(mentionedUserIds, 'ticket_mention', 'in_app')
  for (const userId of mentionedUserIds) {
    if (!userId || userId === senderId) continue
    if (!inAppIds.includes(userId)) continue
    safeNotify(createNotification({
      userId, type: 'ticket_mention',
      title: 'Упоминание в тикете',
      body: `${senderName || 'Пользователь'}: ${t.title}#${ticketId}`,
      link: `/tickets/${ticketId}`,
    }))
  }

  sendTelegramNotification(`📣 Упоминание в тикете #${ticketId}: ${t.title}\n${senderName || 'Пользователь'} упомянул: ${mentionedUserIds.filter(id => id !== senderId).join(', ')}`)
  sendPushToUsers(mentionedUserIds, 'ticket_mention', {
    title: 'Упоминание в тикете',
    body: `${senderName || 'Пользователь'}: ${t.title}#${ticketId}`,
    url: `/tickets/${ticketId}`,
  })
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
  let alreadyNotifiedIds = new Set()
  if (targets.size > 0) {
    const rows = await prisma.notifications.findMany({
      where: {
        user_id: { in: [...targets] },
        type: 'ticket_sla_overdue',
        link: `/tickets/${ticketId}`,
        created_at: { gte: recentCutoff },
      },
      select: { user_id: true },
    })
    alreadyNotifiedIds = new Set(rows.map(r => r.user_id))
  }
  const inAppIds = await allowedUserIds([...targets], 'ticket_sla_overdue', 'in_app')
  for (const userId of targets) {
    if (alreadyNotifiedIds.has(userId)) continue
    if (!inAppIds.includes(userId)) continue
    await createNotification({
      userId,
      type: 'ticket_sla_overdue',
      title: 'Нарушение SLA',
      body: `Тикет #${ticketId} просрочен по SLA`,
      link: `/tickets/${ticketId}`,
    })
  }

  const emailAdminIds = new Set(await allowedUserIds(admins.map(a => a.id), 'ticket_sla_overdue', 'email'))
  const adminEmails = admins
    .filter(a => emailAdminIds.has(a.id))
    .map(a => a.email)
    .filter(Boolean)
  const templates = await getTemplates()
  const cn = await companyName()
  for (const email of adminEmails) {
    const vars = { ticketId: String(ticketId), ticketTitle: t.title, dueAt: formatDate(t.due_at), companyName: cn }
    sendEmail(email,
      replaceVariables(templates.slaBreachedSubject, vars),
      replaceVariables(templates.slaBreachedBody, vars))
  }

  sendTelegramNotification(`🚨 SLA просрочка\nТикет #${ticketId}: ${t.title}\nСрок реакции истёк: ${new Date(t.due_at).toLocaleString('ru-RU')}`)
  sendPushToUsers([...targets], 'ticket_sla_overdue', {
    title: 'Нарушение SLA',
    body: `Тикет #${ticketId} просрочен по SLA`,
    url: `/tickets/${ticketId}`,
  })
}

const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical']

function getNextPriority(current) {
  const idx = PRIORITY_ORDER.indexOf(current)
  if (idx >= PRIORITY_ORDER.length - 1) return null
  return PRIORITY_ORDER[idx + 1]
}

export async function notifySlaEscalated(ticketId, fromPriority, toPriority, level) {
  const t = await getTicketWithUsers(ticketId)
  if (!t) return

  const title = `Эскалация SLA #${ticketId}: ${PRIORITY_LABELS[fromPriority] || fromPriority} → ${PRIORITY_LABELS[toPriority] || toPriority}`
  const body = `Тикет "${t.title}" (#${ticketId}) просрочен по SLA. Приоритет повышен с "${PRIORITY_LABELS[fromPriority] || fromPriority}" до "${PRIORITY_LABELS[toPriority] || toPriority}" (уровень эскалации ${level}).`

  const admins = await prisma.employees.findMany({
    where: { is_active: true, role: { in: ['super_admin', 'admin', 'senior_agent'] } },
    select: { id: true, email: true },
  })
  const targets = new Set([t.creatorId, t.assigneeId].filter(Boolean))
  for (const a of admins) targets.add(a.id)

  const inAppIds = await allowedUserIds([...targets], 'ticket_sla_escalated', 'in_app')
  for (const userId of targets) {
    if (!inAppIds.includes(userId)) continue
    await createNotification({ userId, type: 'ticket_sla_escalated', title, body, link: `/tickets/${ticketId}` })
  }

  const cn = await companyName()
  const vars = { ticketId: String(ticketId), ticketTitle: t.title, fromPriority: PRIORITY_LABELS[fromPriority] || fromPriority, toPriority: PRIORITY_LABELS[toPriority] || toPriority, level: String(level), companyName: cn }
  const emailAdminIds = new Set(await allowedUserIds(admins.map(a => a.id), 'ticket_sla_escalated', 'email'))
  const adminEmails = admins.filter(a => emailAdminIds.has(a.id)).map(a => a.email).filter(Boolean)
  for (const email of adminEmails) {
    sendEmail(email,
      `SLA эскалация #${ticketId}: ${PRIORITY_LABELS[fromPriority] || fromPriority} → ${PRIORITY_LABELS[toPriority] || toPriority}`,
      replaceVariables('Тикет "{{ticketTitle}}" (#{{ticketId}}) просрочен по SLA.\nПриоритет повышен: {{fromPriority}} → {{toPriority}} (уровень {{level}})\n\n{{companyName}}', vars))
  }

  sendTelegramNotification(`🚨 Эскалация SLA\nТикет #${ticketId}: ${t.title}\nПриоритет: ${PRIORITY_LABELS[fromPriority] || fromPriority} → ${PRIORITY_LABELS[toPriority] || toPriority}`)
  sendPushToUsers([...targets], 'ticket_sla_escalated', {
    title: `Эскалация SLA #${ticketId}: ${PRIORITY_LABELS[fromPriority] || fromPriority} → ${PRIORITY_LABELS[toPriority] || toPriority}`,
    body: `Тикет "${t.title}" (#${ticketId}) просрочен по SLA. Приоритет повышен (уровень ${level}).`,
    url: `/tickets/${ticketId}`,
  })

  const { logAudit } = await import('./audit.js')
  await logAudit({
    userId: null,
    userName: 'System',
    action: 'sla_escalated',
    entityType: 'ticket',
    entityId: ticketId,
    details: { fromPriority, toPriority, escalationLevel: level, ticketTitle: t.title },
  })

  const { getIO } = await import('./socket.js')
  const io = getIO()
  if (io) {
    io.to(`ticket:${ticketId}`).emit('ticket:sla:escalated', { ticketId, fromPriority, toPriority, level })
  }
}

const SAMPLE_VARS = {
  ticketId: '101',
  ticketTitle: 'Пример тикета',
  priority: 'Высокий',
  companyName: 'Service Desk',
  userName: 'Иван Иванов',
  oldStatus: 'Открыт',
  newStatus: 'В работе',
  status: 'В работе',
  dueAt: '23.09.2026, 18:00',
  senderName: 'Пётр Петров',
  messageText: 'Текст примера сообщения',
  level: '2',
  fromPriority: 'Средний',
  toPriority: 'Высокий',
}

/** Рендер шаблона email с примерами значений (Этап 58, предпросмотр). */
export async function getEmailTemplatePreview(templateKey) {
  const templates = await getTemplates()
  const raw = templates[templateKey]
  if (raw == null) return null
  return { key: templateKey, rendered: replaceVariables(String(raw), SAMPLE_VARS) }
}
