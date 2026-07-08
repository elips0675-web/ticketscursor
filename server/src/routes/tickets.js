import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import pool from '../db.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { getIO } from '../socket.js'
import { invalidateCache } from '../cache.js'
import { sendTicketNotification } from '../email.js'
import { sendTelegramNotification } from '../telegram.js'
import { logAudit } from '../audit.js'
import { createNotification } from './notifications.js'
import { createTicketValidation, updateStatusValidation, updatePriorityValidation, assignTicketValidation, addMessageValidation } from '../validate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ticketUploads = path.join(__dirname, '..', '..', 'uploads', 'tickets')
fs.mkdirSync(ticketUploads, { recursive: true })

const storage = multer.diskStorage({
  destination: ticketUploads,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, unique + '-' + file.originalname)
  },
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

const router = Router()

router.use(authenticateToken)

// GET /api/tickets — list tickets with pagination
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit) || 1000))
  const offset = (page - 1) * limit
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM tickets')
    const [rows] = await pool.query(`
      SELECT t.*, 
        e.name as assigned_name, e.email as assigned_email, e.avatar as assigned_avatar
      FROM tickets t
      LEFT JOIN employees e ON t.assigned_to = e.id
      ORDER BY t.updated_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset])
    const ids = rows.map(r => r.id)
    if (ids.length > 0) {
      const [messages] = await pool.query(
        'SELECT * FROM ticket_messages WHERE ticket_id IN (?) ORDER BY created_at ASC',
        [ids],
      )
      const msgMap = {}
      for (const m of messages) {
        if (!msgMap[m.ticket_id]) msgMap[m.ticket_id] = []
        msgMap[m.ticket_id].push(m)
      }
      for (const r of rows) {
        r.messages = msgMap[r.id] || []
      }
    }
    res.json({ data: rows, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('Tickets list error:', err)
    res.status(500).json({ message: 'Failed to fetch tickets' })
  }
})

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, e.name as assigned_name, e.email as assigned_email, e.avatar as assigned_avatar
       FROM tickets t LEFT JOIN employees e ON t.assigned_to = e.id WHERE t.id = ?`,
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ message: 'Ticket not found' })

    const [messages] = await pool.query(
      'SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC',
      [req.params.id],
    )
    const ticket = rows[0]
    ticket.messages = messages
    res.json(ticket)
  } catch (err) {
    console.error('Ticket detail error:', err)
    res.status(500).json({ message: 'Failed to fetch ticket' })
  }
})

// POST /api/tickets — create ticket
router.post('/', createTicketValidation, async (req, res) => {
  const { title, description, priority, category } = req.body
  try {
    const [result] = await pool.query(
      'INSERT INTO tickets (title, description, status, priority, category, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [title, description, 'open', priority || 'medium', category || 'support', req.user.userId],
    )
    const ticketId = result.insertId
    await pool.query(
      'INSERT INTO ticket_messages (ticket_id, sender_id, sender_name, text, created_at) VALUES (?, ?, ?, ?, NOW())',
      [ticketId, req.user.userId, req.user.name || 'User', description],
    )
    const [ticket] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId])
    getIO()?.emit('ticket:created', { ...ticket[0], messages: [] })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'created', entityType: 'ticket', entityId: ticketId, details: { title } })
    createNotification({ userId: req.user.userId, type: 'ticket_created', title: 'Тикет создан', body: title, link: `/tickets/${ticketId}` })
    sendTelegramNotification(`🆕 Новый тикет #${ticketId}: ${title}\nПриоритет: ${priority || 'medium'}\nКатегория: ${category || 'support'}`)
    invalidateCache('cache:/api/tickets*')
    res.status(201).json(ticket[0])
  } catch (err) {
    console.error('Create ticket error:', err)
    res.status(500).json({ message: 'Failed to create ticket' })
  }
})

// PUT /api/tickets/:id/status
router.put('/:id/status', requireRole('admin', 'senior_agent'), updateStatusValidation, async (req, res) => {
  const { status } = req.body
  try {
    const [[old]] = await pool.query('SELECT status FROM tickets WHERE id = ?', [req.params.id])
    if (!old) return res.status(404).json({ message: 'Ticket not found' })
    await pool.query('UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id])
    getIO()?.emit('ticket:updated', { id: Number(req.params.id), status, updatedBy: req.user.userId })
    const labels = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён', closed: 'Закрыт' }
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'status_changed', entityType: 'ticket', entityId: Number(req.params.id), details: { from: old.status, to: status } })
    sendTelegramNotification(`📋 Статус тикета #${req.params.id} изменён на: ${labels[status] || status}`)
    const [[ticket]] = await pool.query(
      'SELECT t.title, e.email, e.name FROM tickets t JOIN employees e ON t.created_by = e.id WHERE t.id = ?',
      [req.params.id],
    )
    if (ticket?.email) {
      sendTicketNotification({
        to: ticket.email,
        subject: `Статус тикета #${req.params.id} изменён: ${labels[status] || status}`,
        text: `Тикет "${ticket.title}" (#${req.params.id})\nНовый статус: ${labels[status] || status}\n\nService Desk`,
      })
    }
    invalidateCache('cache:/api/tickets*')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to update status' })
  }
})

// PUT /api/tickets/:id/priority
router.put('/:id/priority', requireRole('admin', 'senior_agent'), updatePriorityValidation, async (req, res) => {
  const { priority } = req.body
  try {
    const [[old]] = await pool.query('SELECT priority FROM tickets WHERE id = ?', [req.params.id])
    await pool.query('UPDATE tickets SET priority = ?, updated_at = NOW() WHERE id = ?', [priority, req.params.id])
    getIO()?.emit('ticket:updated', { id: Number(req.params.id), priority, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'priority_changed', entityType: 'ticket', entityId: Number(req.params.id), details: { from: old?.priority, to: priority } })
    invalidateCache('cache:/api/tickets*')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to update priority' })
  }
})

// PUT /api/tickets/:id/assign
router.put('/:id/assign', requireRole('admin', 'senior_agent'), assignTicketValidation, async (req, res) => {
  const { employeeId } = req.body
  try {
    const [[emp]] = employeeId ? await pool.query('SELECT name FROM employees WHERE id = ?', [employeeId]) : []
    await pool.query('UPDATE tickets SET assigned_to = ?, updated_at = NOW() WHERE id = ?', [employeeId || null, req.params.id])
    getIO()?.emit('ticket:updated', { id: Number(req.params.id), assignedTo: employeeId, updatedBy: req.user.userId })
    logAudit({ userId: req.user.userId, userName: req.user.name, action: 'assigned', entityType: 'ticket', entityId: Number(req.params.id), details: { assignedTo: employeeId || null, assignedName: emp?.name || null } })
    if (employeeId && employeeId !== req.user.userId) {
      const [[t]] = await pool.query('SELECT title FROM tickets WHERE id = ?', [req.params.id])
      createNotification({ userId: employeeId, type: 'ticket_assigned', title: 'Назначен тикет', body: t?.title, link: `/tickets/${req.params.id}` })
    }
    invalidateCache('cache:/api/tickets*')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to assign ticket' })
  }
})

// POST /api/tickets/upload — file upload for messages
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file' })
  res.json({
    url: `/uploads/tickets/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
  })
})

// POST /api/tickets/:id/messages
router.post('/:id/messages', addMessageValidation, async (req, res) => {
  const { text, isInternal, attachments } = req.body
  try {
    const [result] = await pool.query(
      'INSERT INTO ticket_messages (ticket_id, sender_id, sender_name, text, attachments, is_internal, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [req.params.id, req.user.userId, req.user.name || 'User', text, attachments ? JSON.stringify(attachments) : null, isInternal ? 1 : 0],
    )
    const [msg] = await pool.query('SELECT * FROM ticket_messages WHERE id = ?', [result.insertId])
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = ?', [req.params.id])
    getIO()?.emit('ticket:message', { ticketId: Number(req.params.id), message: msg[0] })
    res.status(201).json(msg[0])
  } catch (err) {
    res.status(500).json({ message: 'Failed to add message' })
  }
})

// DELETE /api/tickets/:id/messages/:msgId — admin or own message
router.delete('/:id/messages/:msgId', async (req, res) => {
  try {
    const [[msg]] = await pool.query('SELECT * FROM ticket_messages WHERE id = ?', [req.params.msgId])
    if (!msg) return res.status(404).json({ message: 'Message not found' })
    const isAdmin = req.user.role === 'admin' || req.user.role === 'senior_agent'
    const isOwner = msg.sender_id === req.user.userId
    if (!isAdmin && !isOwner) return res.status(403).json({ message: 'Forbidden' })
    await pool.query('DELETE FROM ticket_messages WHERE id = ?', [req.params.msgId])
    getIO()?.emit('ticket:message-removed', { ticketId: Number(req.params.id), msgId: Number(req.params.msgId) })
    res.json({ success: true })
  } catch (err) {
    console.error('Delete message error:', err)
    res.status(500).json({ message: 'Failed to delete message' })
  }
})

export default router
