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
import { createTicketValidation, updateStatusValidation, updatePriorityValidation, assignTicketValidation, updateTagsValidation, bulkTicketValidation, addMessageValidation } from '../validate.js'
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
} from '../services/tickets.service.js'

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

router.get('/:id', async (req, res) => {
  try {
    const ticketId = Number(req.params.id)
    if (!Number.isFinite(ticketId)) return res.status(400).json({ success: false, message: 'Invalid ticket ID' })
    const mapped = await getTicketById(ticketId)
    if (!mapped) return res.status(404).json({ success: false, message: 'Ticket not found' })
    const canView = hasRole(req.user.role, 'senior_agent') ||
      mapped.created_by === req.user.userId ||
      mapped.assigned_to === req.user.userId
    if (!canView) return res.status(403).json({ success: false, message: 'Forbidden' })
    res.json({
      success: true,
      data: mapped,
    })
  } catch (err) {
    logger.error('Ticket detail error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' })
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
    invalidateCache('cache:/api/tickets*')
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
    const old = await updateTicketStatus(ticketId, status)
    if (!old) return res.status(404).json({ success: false, message: 'Ticket not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, status, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'status_changed', entityType: 'ticket', entityId: ticketId, details: { from: old.status, to: status } })
    try {
      await notifyStatusChanged(ticketId, old.status, status, req.user.name)
    } catch (notifyErr) {
      logger.warn('notifyStatusChanged failed:', notifyErr.message)
    }
    invalidateCache('cache:/api/tickets*')
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
    const result = await updateTicketPriority(ticketId, priority)
    if (!result) return res.status(404).json({ success: false, message: 'Ticket not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, priority, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'priority_changed', entityType: 'ticket', entityId: ticketId, details: { from: result.oldPriority, to: priority } })
    try {
      await notifyPriorityChanged(ticketId, result.oldPriority, priority, req.user.name)
    } catch (notifyErr) {
      logger.warn('notifyPriorityChanged failed:', notifyErr.message)
    }
    invalidateCache('cache:/api/tickets*')
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
    const result = await updateTicketAssignee(ticketId, employeeId)
    if (!result) return res.status(404).json({ success: false, message: 'Ticket or employee not found' })
    enqueueEvent('ticket:updated', null, { id: ticketId, assignedTo: employeeId, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'assigned', entityType: 'ticket', entityId: ticketId, details: { assignedTo: employeeId || null, assignedName: result.employeeName } })
    try {
      await notifyTicketAssigned(ticketId, employeeId, req.user.name)
    } catch (notifyErr) {
      logger.warn('notifyTicketAssigned failed:', notifyErr.message)
    }
    invalidateCache('cache:/api/tickets*')
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
    invalidateCache('cache:/api/tickets*')
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('Update ticket tags error:', err)
    res.status(500).json({ success: false, message: 'Failed to update tags' })
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
    invalidateCache('cache:/api/tickets*')
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
    const canWrite = hasRole(req.user.role, 'senior_agent') ||
      ticket.created_by === req.user.userId ||
      ticket.assigned_to === req.user.userId
    if (!canWrite) return res.status(403).json({ success: false, message: 'Forbidden' })
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
    enqueueEvent('ticket:message', null, { ticketId, message: msg })
    try {
      await notifyTicketMessage(ticketId, req.user.userId, req.user.name, text)
      if (mentionedUserIds.length > 0) {
        await notifyTicketMention(ticketId, mentionedUserIds, req.user.userId, req.user.name)
      }
    } catch (notifyErr) {
      logger.warn('notifyTicketMessage failed:', notifyErr.message)
    }
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
    const result = await getTicketMessages(ticketId, page, limit)
    res.json({ success: true, ...result })
  } catch (err) {
    logger.error('Ticket messages error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch messages' })
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

export default router
