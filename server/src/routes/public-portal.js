import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../prisma.js'
import { sendTicketNotification } from '../email.js'
import logger from '../logger.js'

const router = Router()

router.post('/tickets', async (req, res) => {
  try {
    const { name, email, subject, description, category, priority } = req.body
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' })
    if (!email?.trim()) return res.status(400).json({ success: false, message: 'Email is required' })
    if (!subject?.trim()) return res.status(400).json({ success: false, message: 'Subject is required' })

    const token = crypto.randomBytes(32).toString('hex')
    const hash = await bcrypt.hash(token, 12)

    let employee = await prisma.employees.findFirst({
      where: { email },
      select: { id: true },
    })

    if (!employee) {
      employee = await prisma.employees.create({
        data: {
          name,
          email,
          password_hash: hash,
          role: 'requester',
          department: '',
          title: 'Portal User',
          is_active: true,
        },
      })
    }

    const ticket = await prisma.tickets.create({
      data: {
        title: subject.trim(),
        description: description || null,
        priority: priority || 'medium',
        category: category || 'support',
        created_by: employee.id,
      },
    })

    const trackingToken = `${ticket.id}-${token.slice(0, 16)}`
    await prisma.tickets.update({
      where: { id: ticket.id },
      data: { tags: JSON.stringify({ tracking_token: trackingToken, portal_user: true }) },
    })

    try {
      await sendTicketNotification({
        to: email,
        subject: `Ticket #${ticket.id} created — ${subject}`,
        text: `Your ticket has been created.\n\nTicket ID: #${ticket.id}\nSubject: ${subject}\nTracking link: ${req.headers.origin || 'http://localhost:5173'}/portal/track/${trackingToken}\n\nYou can reply to this email to add comments.`,
      })
    } catch (e) {
      logger.warn('Portal ticket notification failed:', e.message)
    }

    res.status(201).json({
      success: true,
      data: {
        ticketId: ticket.id,
        trackingToken,
        trackingUrl: `${req.headers.origin || 'http://localhost:5173'}/portal/track/${trackingToken}`,
      },
    })
  } catch (err) {
    logger.error('Public portal create ticket error:', err)
    res.status(500).json({ success: false, message: 'Failed to create ticket' })
  }
})

router.get('/track/:token', async (req, res) => {
  try {
    const { token } = req.params
    const parts = token.split('-')
    if (parts.length < 2) return res.status(400).json({ success: false, message: 'Invalid token' })

    const ticketId = parseInt(parts[0])
    if (!ticketId) return res.status(400).json({ success: false, message: 'Invalid token' })

    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: {
        id: true, title: true, description: true, status: true, priority: true,
        category: true, created_at: true, updated_at: true,
        created_by_employee: { select: { name: true, email: true } },
        ticket_messages: {
          where: { deleted_at: null, is_internal: false },
          orderBy: { created_at: 'asc' },
          select: { id: true, sender_name: true, text: true, created_at: true, attachments: true },
        },
      },
    })

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })

    const tagStr = typeof ticket.tags === 'string' ? ticket.tags : JSON.stringify(ticket.tags || '{}')
    let tags = {}
    try { tags = JSON.parse(tagStr) } catch { tags = {} }
    if (tags.tracking_token !== token) {
      return res.status(403).json({ success: false, message: 'Invalid tracking token' })
    }

    const messages = ticket.ticket_messages.map(m => ({
      id: m.id,
      sender: m.sender_name,
      text: m.text,
      created_at: m.created_at,
      attachments: m.attachments ? JSON.parse(m.attachments) : [],
    }))

    res.json({
      success: true,
      data: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        requester: ticket.created_by_employee?.name || 'Unknown',
        messages,
      },
    })
  } catch (err) {
    logger.error('Public portal track error:', err)
    res.status(500).json({ success: false, message: 'Failed to track ticket' })
  }
})

router.post('/track/:token/reply', async (req, res) => {
  try {
    const { token } = req.params
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Reply text is required' })

    const parts = token.split('-')
    const ticketId = parseInt(parts[0])
    if (!ticketId) return res.status(400).json({ success: false, message: 'Invalid token' })

    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, created_by: true },
    })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })

    const tagStr = typeof ticket.tags === 'string' ? ticket.tags : JSON.stringify(ticket.tags || '{}')
    let tags = {}
    try { tags = JSON.parse(tagStr) } catch { tags = {} }
    if (tags.tracking_token !== token) {
      return res.status(403).json({ success: false, message: 'Invalid tracking token' })
    }

    const msg = await prisma.ticket_messages.create({
      data: {
        ticket_id: ticketId,
        sender_id: ticket.created_by,
        sender_name: 'Portal User',
        text: text.trim(),
      },
    })

    await prisma.tickets.update({ where: { id: ticketId }, data: { updated_at: new Date() } })

    res.status(201).json({ success: true, data: { id: msg.id, text: msg.text, created_at: msg.created_at } })
  } catch (err) {
    logger.error('Public portal reply error:', err)
    res.status(500).json({ success: false, message: 'Failed to reply' })
  }
})

export default router
