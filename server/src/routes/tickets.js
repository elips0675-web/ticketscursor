import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import prisma from '../prisma.js'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { hasRole } from '../utils/roleUtils.js'
import { invalidateCache } from '../cache.js'
import { enqueueEvent } from '../outbox.js'
import { logAudit } from '../audit.js'
import { notifyTicketCreated, notifyStatusChanged, notifyPriorityChanged, notifyTicketAssigned, notifyTicketMessage, notifyTicketMention } from '../notify.js'
import { createSurvey } from '../services/csat.service.js'
import { sendCsatSurvey } from '../email.js'
import { triggerWebhooks } from '../services/webhooks.service.js'
import { acquireLock, releaseLock, forceRelease, getLockStatus } from '../services/collision.service.js'
import { evaluateRules } from '../services/rules.service.js'
import { createTicketValidation, updateStatusValidation, updatePriorityValidation, assignTicketValidation, updateTagsValidation, bulkTicketValidation, addMessageValidation, addTimeValidation } from '../validate.js'
import logger from '../logger.js'
import { idempotent } from '../middleware/idempotency.js'
import { validateUpload } from '../middleware/validateUpload.js'
import {
  listTickets,
  listOverdueSlaTickets,
  getSlaStats,
  getTicketById,
  getTicketMessages,
  createTicket,
  updateTicketStatus,
  updateTicketPriority,
  updateTicketAssignee,
  updateTicketTags,
  bulkUpdateTickets,
  generateTicketFilename,
  resolveMentionedEmployees,
  deleteTicket,
} from '../services/tickets.service.js'
import {
  listTimeEntries,
  getTimeTotals,
  addTimeEntry,
  getTimeEntryById,
  deleteTimeEntry,
  getActiveTimer,
  startTimer,
  stopTimer,
} from '../services/time.service.js'
import { generateAssistantSuggestion } from '../services/assistant.service.js'
import { listFieldDefinitions, getTicketCustomFields, setTicketCustomFields } from '../services/custom-fields.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ticketUploads = path.join(__dirname, '..', '..', 'uploads', 'tickets')
fs.mkdirSync(ticketUploads, { recursive: true })

const storage = multer.diskStorage({
  destination: ticketUploads,
  filename: (req, file, cb) => {
    cb(null, generateTicketFilename(file.originalname))
  },
})
const TICKET_ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'application/zip', 'application/x-rar-compressed']
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (TICKET_ALLOWED.includes(file.mimetype)) return cb(null, true)
    cb(new Error(`Недопустимый тип файла: ${file.mimetype}`))
  },
})

const router = Router()

router.use(authenticateToken)
router.use(auditLogMiddleware)

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50))
  const tags = req.query.tag ? [String(req.query.tag)] : undefined
  try {
    const payload = await listTickets({ page, limit, userId: req.user.userId, role: req.user.role, tags })
    res.json({ success: true, ...payload })
  } catch (err) {
    logger.error('Tickets list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' })
  }
})

router.get('/sla/overdue', requireRole('admin', 'senior_agent'), async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100))
  try {
    const data = await listOverdueSlaTickets(limit)
    res.json({ success: true, data, total: data.length })
  } catch (err) {
    logger.error('SLA overdue list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch overdue SLA tickets' })
  }
})

router.get('/sla/stats', requireRole('admin', 'senior_agent'), async (req, res) => {
  try {
    const data = await getSlaStats()
    res.json({ success: true, data })
  } catch (err) {
    logger.error('SLA stats error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch SLA stats' })
  }
})

router.get('/custom-fields', async (req, res) => {
  try {
    const category = req.query.category || undefined
    const data = await listFieldDefinitions(category)
    res.json({ success: true, data })
  } catch (err) {
    logger.error('Custom fields list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch custom fields' })
  }
})

const canAccessTicket = (ticket, user) =>
  hasRole(user.role, 'senior_agent') ||
  ticket.created_by === user.userId ||
  ticket.assigned_to === user.userId ||
  (ticket.assigned_to === null && hasRole(user.role, 'agent'))

router.get('/:id', async (req, res) => {
  try {
    const ticketId = Number(req.params.id)
    if (!Number.isFinite(ticketId)) return res.status(400).json({ success: false, message: 'Invalid ticket ID' })
    const mapped = await getTicketById(ticketId)
    if (!mapped) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (!canAccessTicket(mapped, req.user)) return res.status(403).json({ success: false, message: 'Forbidden' })
    res.json({
      success: true,
      data: mapped,
    })
  } catch (err) {
    logger.error('Ticket detail error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' })
  }
})

// История изменений тикета (Этап 62): события из audit_log — кто/когда менял статус/приоритет/исполнителя.
router.get('/:id/history', async (req, res) => {
  try {
    const ticketId = Number(req.params.id)
    if (!Number.isFinite(ticketId)) return res.status(400).json({ success: false, message: 'Invalid ticket ID' })
    const ticket = await prisma.tickets.findFirst({
      where: { id: ticketId, deleted_at: null },
      select: { id: true, created_by: true, assigned_to: true },
    })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (!canAccessTicket(ticket, req.user)) return res.status(403).json({ success: false, message: 'Forbidden' })
    const events = await prisma.audit_log.findMany({
      where: { entity_type: 'ticket', entity_id: ticketId },
      select: { id: true, user_id: true, user_name: true, action: true, details: true, created_at: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 200,
    })
    const rows = events.map((e) => {
      let parsed = null
      if (e.details) {
        try {
          parsed = JSON.parse(e.details)
        } catch {
          parsed = null
        }
      }
      return { ...e, details: parsed }
    })
    res.json({ success: true, data: rows })
  } catch (err) {
    logger.error('Ticket history error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch ticket history' })
  }
})

router.post('/', idempotent, createTicketValidation, async (req, res) => {
  const { title, description, priority, category, tags } = req.body
  try {
    const { ticket, dueAt, autoAssignedTo } = await createTicket({
      title,
      description,
      priority,
      category,
      tags,
      createdBy: req.user.userId,
    })
    await prisma.ticket_messages.create({
      data: {
        ticket_id: ticket.id,
        sender_id: req.user.userId,
        sender_name: req.user.name || 'User',
        text: description,
      },
    })
    enqueueEvent('ticket:created', null, { ...ticket, messages: [] })
    logAudit({
      userId: req.user.userId,
      userName: req.user.name,
      action: 'created',
      entityType: 'ticket',
      entityId: ticket.id,
      details: { title, dueAt, autoAssignedTo },
    })
    try {
      await notifyTicketCreated(ticket.id, req.user.name)
      if (autoAssignedTo) {
        await notifyTicketAssigned(ticket.id, autoAssignedTo, req.user.name)
      }
    } catch (notifyErr) {
      logger.warn('Notification failed on ticket create:', notifyErr.message)
    }
    triggerWebhooks('ticket.created', { ticket }).catch(() => {})
    evaluateRules('ticket.created', { ...ticket, userId: req.user.userId }).catch(() => {})
    invalidateCache('cache:*:/api/tickets*')
    res.status(201).json({ success: true, data: ticket })
  } catch (err) {
    logger.error('Create ticket error:', err)
    res.status(500).json({ success: false, message: 'Failed to create ticket' })
  }
})

router.put('/:id/status', requireRole('admin', 'senior_agent'), updateStatusValidation, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { status } = req.body
  try {
    const lock = await getLockStatus(ticketId)
    if (lock?.locked && lock.lockedBy.id !== req.user.userId && !hasRole(req.user.role, 'senior_agent')) {
      return res.status(423).json({ success: false, message: `Ticket is locked by ${lock.lockedBy.name}` })
    }
    const old = await updateTicketStatus(ticketId, status)
    if (!old) return res.status(404).json({ success: false, message: 'Ticket not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, status, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'status_changed', entityType: 'ticket', entityId: ticketId, details: { from: old.status, to: status } })
    try {
      await notifyStatusChanged(ticketId, old.status, status, req.user.name)
    } catch (notifyErr) {
      logger.warn('notifyStatusChanged failed:', notifyErr.message)
    }
    if ((status === 'resolved' || status === 'closed') && old.status !== 'resolved' && old.status !== 'closed') {
      try {
        const ticket = await prisma.tickets.findUnique({
          where: { id: ticketId },
          select: { title: true, created_by: true, created_by_employee: { select: { email: true, name: true } } },
        })
        if (ticket?.created_by_employee?.email) {
          const survey = await createSurvey(ticketId, ticket.created_by_employee.email)
          const baseUrl = process.env.BASE_URL || process.env.CORS_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
          const surveyUrl = `${baseUrl}/csat/${survey.token}`
          await sendCsatSurvey({
            to: ticket.created_by_employee.email,
            ticketTitle: ticket.title,
            surveyUrl,
          })
        }
      } catch (csatErr) {
        logger.warn('CSAT survey creation failed:', csatErr.message)
      }
    }
    triggerWebhooks('ticket.updated', { id: ticketId, status, oldStatus: old.status }).catch(() => {})
    evaluateRules('ticket.updated', { id: ticketId, status, oldStatus: old.status, userId: req.user.userId }).catch(() => {})
    if (status === 'closed') {
      triggerWebhooks('ticket.closed', { id: ticketId }).catch(() => {})
    }
    invalidateCache('cache:*:/api/tickets*')
    res.json({ success: true, data: { id: ticketId, status } })
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message })
    }
    logger.error('Update status error:', err)
    res.status(500).json({ success: false, message: 'Failed to update status' })
  }
})

router.put('/:id/priority', requireRole('admin', 'senior_agent'), updatePriorityValidation, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { priority } = req.body
  try {
    const lock = await getLockStatus(ticketId)
    if (lock?.locked && lock.lockedBy.id !== req.user.userId && !hasRole(req.user.role, 'senior_agent')) {
      return res.status(423).json({ success: false, message: `Ticket is locked by ${lock.lockedBy.name}` })
    }
    const result = await updateTicketPriority(ticketId, priority)
    if (!result) return res.status(404).json({ success: false, message: 'Ticket not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, priority, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'priority_changed', entityType: 'ticket', entityId: ticketId, details: { from: result.oldPriority, to: priority } })
    try {
      await notifyPriorityChanged(ticketId, result.oldPriority, priority, req.user.name)
    } catch (notifyErr) {
      logger.warn('notifyPriorityChanged failed:', notifyErr.message)
    }
    triggerWebhooks('ticket.updated', { id: ticketId, priority, oldPriority: result.oldPriority }).catch(() => {})
    evaluateRules('ticket.updated', { id: ticketId, priority, oldPriority: result.oldPriority, userId: req.user.userId }).catch(() => {})
    invalidateCache('cache:*:/api/tickets*')
    res.json({ success: true, data: { id: ticketId, priority } })
  } catch (err) {
    logger.error('Update priority error:', err)
    res.status(500).json({ success: false, message: 'Failed to update priority' })
  }
})

router.put('/:id/assign', requireRole('admin', 'senior_agent'), assignTicketValidation, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { employeeId } = req.body
  try {
    const lock = await getLockStatus(ticketId)
    if (lock?.locked && lock.lockedBy.id !== req.user.userId && !hasRole(req.user.role, 'senior_agent')) {
      return res.status(423).json({ success: false, message: `Ticket is locked by ${lock.lockedBy.name}` })
    }
    const result = await updateTicketAssignee(ticketId, employeeId)
    if (!result) return res.status(404).json({ success: false, message: 'Ticket or employee not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, assignedTo: employeeId, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'assigned', entityType: 'ticket', entityId: ticketId, details: { assignedTo: employeeId || null, assignedName: result.employeeName } })
    try {
      await notifyTicketAssigned(ticketId, employeeId, req.user.name)
    } catch (notifyErr) {
      logger.warn('notifyTicketAssigned failed:', notifyErr.message)
    }
    triggerWebhooks('ticket.assigned', { id: ticketId, assignedTo: employeeId, assignedName: result.employeeName }).catch(() => {})
    evaluateRules('ticket.assigned', { id: ticketId, assignedTo: employeeId, assignedName: result.employeeName, userId: req.user.userId }).catch(() => {})
    invalidateCache('cache:*:/api/tickets*')
    res.json({ success: true, data: { id: ticketId, assignedTo: employeeId || null } })
  } catch (err) {
    logger.error('Assign ticket error:', err)
    res.status(500).json({ success: false, message: 'Failed to assign ticket' })
  }
})

router.put('/:id/tags', requireRole('admin', 'senior_agent', 'agent'), updateTagsValidation, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { tags } = req.body
  try {
    const result = await updateTicketTags(ticketId, tags)
    if (!result) return res.status(404).json({ success: false, message: 'Ticket not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, tags, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'tags_updated', entityType: 'ticket', entityId: ticketId, details: { tags } })
    invalidateCache('cache:*:/api/tickets*')
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('Update ticket tags error:', err)
    res.status(500).json({ success: false, message: 'Failed to update tags' })
  }
})

router.put('/:id/custom-fields', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  const { fields } = req.body
  try {
    const ticket = await prisma.tickets.findUnique({ where: { id: ticketId }, select: { id: true } })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    await setTicketCustomFields(ticketId, fields)
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'custom_fields_updated', entityType: 'ticket', entityId: ticketId, details: { fieldCount: fields?.length || 0 } })
    invalidateCache('cache:*:/api/tickets*')
    const updatedFields = await getTicketCustomFields(ticketId)
    res.json({ success: true, data: updatedFields })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message })
    logger.error('Update custom fields error:', err)
    res.status(500).json({ success: false, message: 'Failed to update custom fields' })
  }
})

router.post('/bulk', requireRole('admin', 'senior_agent', 'agent'), bulkTicketValidation, async (req, res) => {
  const { ids, action, status, employeeId, priority } = req.body
  try {
    const result = await bulkUpdateTickets({ ids, action, status, employeeId, priority })
    if (action === 'assign' && result.updated > 0) {
      enqueueEvent('ticket:updated', null, { ids, action, assignedTo: employeeId || null, updatedBy: req.user.userId })
      logAudit({ userId: req.user.userId, userName: req.user.name, action: 'bulk_assigned', entityType: 'ticket', entityId: null, details: { ids, employeeId: employeeId || null } })
      try {
        await notifyTicketAssigned(ids[0], employeeId, req.user.name)
      } catch (notifyErr) {
        logger.warn('notifyTicketAssigned failed on bulk:', notifyErr.message)
      }
    } else if (action === 'status') {
      enqueueEvent('ticket:updated', null, { ids, action, status, updatedBy: req.user.userId })
      logAudit({ userId: req.user.userId, userName: req.user.name, action: 'bulk_status_changed', entityType: 'ticket', entityId: null, details: { ids, status } })
    } else if (action === 'priority') {
      enqueueEvent('ticket:updated', null, { ids, action, priority, updatedBy: req.user.userId })
      logAudit({ userId: req.user.userId, userName: req.user.name, action: 'bulk_priority_changed', entityType: 'ticket', entityId: null, details: { ids, priority } })
    }
    invalidateCache('cache:*:/api/tickets*')
    res.json({ success: true, data: result })
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message })
    }
    logger.error('Bulk ticket update error:', err)
    res.status(500).json({ success: false, message: 'Failed to bulk update tickets' })
  }
})

router.post('/upload', upload.single('file'), validateUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file' })
  res.json({
    success: true,
    url: `/uploads/tickets/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
  })
})

router.post('/:id/messages', idempotent, addMessageValidation, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { text, isInternal, attachments } = req.body
  try {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, created_by: true, assigned_to: true },
    })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (!canAccessTicket(ticket, req.user)) return res.status(403).json({ success: false, message: 'Forbidden' })
    const mentionedUserIds = await resolveMentionedEmployees(text, req.user.userId)
    const msg = await prisma.ticket_messages.create({
      data: {
        ticket_id: ticketId,
        sender_id: req.user.userId,
        sender_name: req.user.name || 'User',
        text,
        attachments: attachments ? JSON.stringify(attachments) : null,
        mentions: mentionedUserIds.length > 0 ? JSON.stringify(mentionedUserIds) : null,
        is_internal: isInternal ? true : false,
      },
    })
    await prisma.tickets.update({ where: { id: ticketId }, data: { updated_at: new Date() } })
    await invalidateCache('cache:*:/api/tickets*')
    enqueueEvent('ticket:message', null, { ticketId, message: msg })
    try {
      await notifyTicketMessage(ticketId, req.user.userId, req.user.name, text)
      if (mentionedUserIds.length > 0) {
        await notifyTicketMention(ticketId, mentionedUserIds, req.user.userId, req.user.name)
      }
    } catch (notifyErr) {
      logger.warn('notifyTicketMessage failed:', notifyErr.message)
    }
    triggerWebhooks('ticket.message', { ticketId, message: { id: msg.id, sender_name: req.user.name, text } }).catch(() => {})
    evaluateRules('ticket.message', { id: ticketId, ticketId, text, sender_name: req.user.name, userId: req.user.userId }).catch(() => {})
    res.status(201).json({ success: true, data: msg })
  } catch (err) {
    logger.error('Add message error:', err)
    res.status(500).json({ success: false, message: 'Failed to add message' })
  }
})

router.get('/:id/messages', async (req, res) => {
  const ticketId = Number(req.params.id)
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
  try {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, created_by: true, assigned_to: true, deleted_at: true },
    })
    if (!ticket || ticket.deleted_at) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (!canAccessTicket(ticket, req.user)) return res.status(403).json({ success: false, message: 'Forbidden' })
    const result = await getTicketMessages(ticketId, page, limit)
    res.json({ success: true, ...result })
  } catch (err) {
    logger.error('Ticket messages error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch messages' })
  }
})

router.post('/:id/assistant', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, title: true, description: true },
    })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    const messages = await prisma.ticket_messages.findMany({
      where: { ticket_id: ticketId, deleted_at: null },
      orderBy: { created_at: 'asc' },
      take: 50,
      select: { text: true },
    })
    const suggestion = await generateAssistantSuggestion({ ticket, messages })
    res.json({ success: true, data: suggestion })
  } catch (err) {
    logger.error('Assistant suggestion error:', err)
    res.status(500).json({ success: false, message: 'Failed to generate assistant suggestion' })
  }
})

router.delete('/:id/messages/:msgId', async (req, res) => {
  try {
    const msg = await prisma.ticket_messages.findUnique({ where: { id: Number(req.params.msgId) } })
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    const isAdmin = hasRole(req.user.role, 'senior_agent')
    const isOwner = msg.sender_id === req.user.userId
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, message: 'Forbidden' })
    await prisma.ticket_messages.update({ where: { id: Number(req.params.msgId) }, data: { deleted_at: new Date() } })
    enqueueEvent('ticket:message-removed', null, { ticketId: Number(req.params.id), msgId: Number(req.params.msgId) })
    res.json({ success: true, data: { msgId: Number(req.params.msgId) } })
  } catch (err) {
    logger.error('Delete message error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete message' })
  }
})

router.get('/:id/time', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const [entries, totals, activeTimer] = await Promise.all([
      listTimeEntries(ticketId),
      getTimeTotals(ticketId),
      getActiveTimer(ticketId, req.user.userId),
    ])
    res.json({ success: true, data: { entries, ...totals, activeTimer } })
  } catch (err) {
    logger.error('Get time entries error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch time entries' })
  }
})

router.post('/:id/time', requireRole('admin', 'senior_agent', 'agent'), addTimeValidation, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { minutes, description } = req.body
  try {
    const ticket = await prisma.tickets.findUnique({ where: { id: ticketId }, select: { id: true } })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    const entry = await addTimeEntry({ ticketId, userId: req.user.userId, minutes, description })
    const totals = await getTimeTotals(ticketId)
    invalidateCache('cache:*:/api/tickets*')
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'time_added', entityType: 'ticket', entityId: ticketId, details: { minutes, entryId: entry.id } })
    res.status(201).json({ success: true, data: entry, totals })
  } catch (err) {
    logger.error('Add time error:', err)
    res.status(500).json({ success: false, message: 'Failed to add time' })
  }
})

router.delete('/:id/time/:entryId', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  const entryId = Number(req.params.entryId)
  try {
    const entry = await getTimeEntryById(entryId)
    if (!entry) return res.status(404).json({ success: false, message: 'Time entry not found' })
    const isAdmin = hasRole(req.user.role, 'senior_agent')
    const isOwner = entry.user_id === req.user.userId
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, message: 'Forbidden' })
    await deleteTimeEntry(entryId)
    invalidateCache('cache:*:/api/tickets*')
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'time_removed', entityType: 'ticket', entityId: ticketId, details: { entryId } })
    res.json({ success: true, data: { entryId } })
  } catch (err) {
    logger.error('Delete time entry error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete time entry' })
  }
})

router.get('/:id/time/timer', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  try {
    const timer = await getActiveTimer(Number(req.params.id), req.user.userId)
    res.json({ success: true, data: timer })
  } catch (err) {
    logger.error('Get timer error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch timer' })
  }
})

router.post('/:id/time/timer/start', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const ticket = await prisma.tickets.findUnique({ where: { id: ticketId }, select: { id: true } })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    const timer = await startTimer(ticketId, req.user.userId)
    res.status(201).json({ success: true, data: timer })
  } catch (err) {
    logger.error('Start timer error:', err)
    res.status(500).json({ success: false, message: 'Failed to start timer' })
  }
})

router.post('/:id/time/timer/stop', requireRole('admin', 'senior_agent', 'agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const result = await stopTimer(ticketId, req.user.userId)
    if (!result) return res.status(404).json({ success: false, message: 'No active timer' })
    const totals = await getTimeTotals(ticketId)
    invalidateCache('cache:*:/api/tickets*')
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'time_timer_stopped', entityType: 'ticket', entityId: ticketId, details: { minutes: result.minutes, entryId: result.entry.id } })
    res.json({ success: true, data: result, totals })
  } catch (err) {
    logger.error('Stop timer error:', err)
    res.status(500).json({ success: false, message: 'Failed to stop timer' })
  }
})

router.post('/:id/lock', async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, created_by: true, assigned_to: true, deleted_at: true },
    })
    if (!ticket || ticket.deleted_at) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (!canAccessTicket(ticket, req.user)) return res.status(403).json({ success: false, message: 'Forbidden' })
    const result = await acquireLock(ticketId, req.user.userId)
    if (result.error === 'not_found') return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (result.error === 'locked') {
      return res.status(423).json({ success: false, message: `Ticket is locked by ${result.lockedBy}`, lockedBy: result.lockedBy, lockedAt: result.lockedAt })
    }
    enqueueEvent('ticket:locked', null, { ticketId, userId: req.user.userId, userName: req.user.name })
    res.json({ success: true })
  } catch (err) {
    logger.error('Lock ticket error:', err)
    res.status(500).json({ success: false, message: 'Failed to lock ticket' })
  }
})

router.delete('/:id/lock', async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const result = await releaseLock(ticketId, req.user.userId)
    if (result.error === 'not_found') return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (result.error === 'not_owner') return res.status(403).json({ success: false, message: 'Cannot release lock of another user' })
    enqueueEvent('ticket:unlocked', null, { ticketId, userId: req.user.userId })
    res.json({ success: true })
  } catch (err) {
    logger.error('Unlock ticket error:', err)
    res.status(500).json({ success: false, message: 'Failed to release lock' })
  }
})

router.post('/:id/force-unlock', requireRole('admin', 'senior_agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    await forceRelease(ticketId)
    enqueueEvent('ticket:unlocked', null, { ticketId, userId: req.user.userId, forced: true })
    res.json({ success: true })
  } catch (err) {
    logger.error('Force unlock error:', err)
    res.status(500).json({ success: false, message: 'Failed to force unlock' })
  }
})

router.get('/:id/lock', async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, created_by: true, assigned_to: true, deleted_at: true },
    })
    if (!ticket || ticket.deleted_at) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (!canAccessTicket(ticket, req.user)) return res.status(403).json({ success: false, message: 'Forbidden' })
    const status = await getLockStatus(ticketId)
    if (!status) return res.status(404).json({ success: false, message: 'Ticket not found' })
    res.json({ success: true, data: status })
  } catch (err) {
    logger.error('Get lock status error:', err)
    res.status(500).json({ success: false, message: 'Failed to get lock status' })
  }
})

router.delete('/:id', requireRole('admin', 'senior_agent'), async (req, res) => {
  const ticketId = Number(req.params.id)
  try {
    const result = await deleteTicket(ticketId)
    if (!result) return res.status(404).json({ success: false, message: 'Ticket not found' })
    if (result.alreadyDeleted) return res.status(200).json({ success: true, data: result, message: 'Ticket already deleted' })
    await invalidateCache('cache:*:/api/tickets*')
    enqueueEvent('ticket:deleted', null, { ticketId, deletedBy: req.user.userId, ticketTitle: result.title })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'deleted', entity: 'ticket', entityId: ticketId, details: { title: result.title } })
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('Delete ticket error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete ticket' })
  }
})

export default router
