import { Router } from 'express'
import crypto from 'node:crypto'
import prisma from '../prisma.js'
import logger from '../logger.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { auditLogMiddleware } from '../audit.js'
import { enqueueEvent } from '../outbox.js'

const router = Router()
router.use(authenticateToken)
router.use(auditLogMiddleware)
router.use(requireRole('agent'))

const MAX_TEXT = 4000
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function publicMessage(message) {
  return {
    id: message.id,
    sender_type: message.sender_type,
    sender_name: message.sender_name,
    text: message.text,
    created_at: message.created_at,
  }
}

function normalizeOrigins(value) {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join('\n')
  return String(value).trim()
}

router.get('/conversations', async (req, res) => {
  try {
    const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : 'open'
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const take = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))

    const where = { status }
    if (q) {
      where.OR = [{ visitor_name: { contains: q } }, { visitor_email: { contains: q } }]
    }

    const conversations = await prisma.widget_conversations.findMany({
      where,
      orderBy: { last_message_at: 'desc' },
      take,
      include: {
        channel: { select: { name: true } },
        messages: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    })

    res.json({
      success: true,
      data: conversations.map((conversation) => ({
        id: conversation.id,
        channel: conversation.channel?.name || '',
        visitor_name: conversation.visitor_name,
        visitor_email: conversation.visitor_email,
        status: conversation.status,
        unread_for_agent: conversation.unread_for_agent,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
        last_message: conversation.messages[0] ? publicMessage(conversation.messages[0]) : null,
      })),
    })
  } catch (err) {
    logger.error('Widget inbox list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' })
  }
})

router.get('/conversations/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })

    const conversation = await prisma.widget_conversations.findUnique({
      where: { id },
      include: {
        channel: { select: { name: true, color: true } },
        messages: { orderBy: { created_at: 'asc' }, take: 500 },
      },
    })
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' })

    res.json({
      success: true,
      data: {
        id: conversation.id,
        channel: conversation.channel?.name || '',
        visitor_name: conversation.visitor_name,
        visitor_email: conversation.visitor_email,
        visitor_id: conversation.visitor_id,
        status: conversation.status,
        unread_for_agent: conversation.unread_for_agent,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
        messages: conversation.messages.map(publicMessage),
      },
    })
  } catch (err) {
    logger.error('Widget inbox detail error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' })
  }
})

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!text) return res.status(400).json({ success: false, message: 'Text is required' })
    if (text.length > MAX_TEXT) {
      return res.status(400).json({ success: false, message: `Text too long (max ${MAX_TEXT} chars)` })
    }

    const conversation = await prisma.widget_conversations.findUnique({ where: { id } })
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' })

    let senderName = req.user.name
    if (!senderName) {
      const employee = await prisma.employees.findUnique({ where: { id: req.user.userId }, select: { name: true } })
      senderName = employee?.name || 'Оператор'
    }

    const message = await prisma.widget_messages.create({
      data: {
        conversation_id: id,
        sender_type: 'agent',
        sender_name: senderName,
        employee_id: req.user.userId,
        text,
      },
    })
    await prisma.widget_conversations.update({
      where: { id },
      data: { status: 'open', unread_for_agent: 0, last_message_at: new Date() },
    })

    enqueueEvent('widget:message', `widget:${id}`, {
      conversationId: id,
      message: publicMessage(message),
    })
    enqueueEvent('widget:message', 'agents', {
      conversationId: id,
      visitorName: conversation.visitor_name,
      message: publicMessage(message),
    })

    res.status(201).json({ success: true, data: publicMessage(message) })
  } catch (err) {
    logger.error('Widget inbox reply error:', err)
    res.status(500).json({ success: false, message: 'Failed to send message' })
  }
})

router.post('/conversations/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })
    const updated = await prisma.widget_conversations.update({ where: { id }, data: { unread_for_agent: 0 } })
    res.json({ success: true, data: { id: updated.id, unread_for_agent: updated.unread_for_agent } })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Conversation not found' })
    logger.error('Widget inbox read error:', err)
    res.status(500).json({ success: false, message: 'Failed to mark read' })
  }
})

router.post('/conversations/:id/close', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })
    const updated = await prisma.widget_conversations.update({
      where: { id },
      data: { status: 'closed', unread_for_agent: 0 },
    })
    res.json({ success: true, data: { id: updated.id, status: updated.status } })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Conversation not found' })
    logger.error('Widget inbox close error:', err)
    res.status(500).json({ success: false, message: 'Failed to close conversation' })
  }
})

router.post('/conversations/:id/reopen', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })
    const updated = await prisma.widget_conversations.update({
      where: { id },
      data: { status: 'open' },
    })
    res.json({ success: true, data: { id: updated.id, status: updated.status } })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Conversation not found' })
    logger.error('Widget inbox reopen error:', err)
    res.status(500).json({ success: false, message: 'Failed to reopen conversation' })
  }
})

router.get('/channels', requireRole('admin'), async (req, res) => {
  try {
    const channels = await prisma.widget_channels.findMany({ orderBy: { id: 'asc' } })
    res.json({ success: true, data: channels })
  } catch (err) {
    logger.error('Widget channels list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch channels' })
  }
})

router.post('/channels', requireRole('admin'), async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' })
    if (name.length > 120) return res.status(400).json({ success: false, message: 'Name too long (max 120 chars)' })

    const channel = await prisma.widget_channels.create({
      data: {
        name,
        website_token: crypto.randomBytes(16).toString('hex'),
        welcome_message: typeof req.body?.welcome_message === 'string' ? req.body.welcome_message.slice(0, 1000) : '',
        offline_message: typeof req.body?.offline_message === 'string' ? req.body.offline_message.slice(0, 1000) : '',
        allowed_origins: normalizeOrigins(req.body?.allowed_origins) || '',
      },
    })
    res.status(201).json({ success: true, data: channel })
  } catch (err) {
    logger.error('Widget channel create error:', err)
    res.status(500).json({ success: false, message: 'Failed to create channel' })
  }
})

router.patch('/channels/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })

    const data = {}
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name || name.length > 120) return res.status(400).json({ success: false, message: 'Invalid name' })
      data.name = name
    }
    if (req.body?.welcome_message !== undefined) data.welcome_message = String(req.body.welcome_message).slice(0, 1000)
    if (req.body?.offline_message !== undefined) data.offline_message = String(req.body.offline_message).slice(0, 1000)
    if (req.body?.color !== undefined) {
      const color = String(req.body.color).trim()
      if (!COLOR_RE.test(color)) return res.status(400).json({ success: false, message: 'Invalid color' })
      data.color = color
    }
    if (req.body?.enabled !== undefined) data.enabled = Boolean(req.body.enabled)
    const origins = normalizeOrigins(req.body?.allowed_origins)
    if (origins !== undefined) data.allowed_origins = origins

    const channel = await prisma.widget_channels.update({ where: { id }, data })
    res.json({ success: true, data: channel })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Channel not found' })
    logger.error('Widget channel update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update channel' })
  }
})

router.post('/channels/:id/rotate-token', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' })
    const channel = await prisma.widget_channels.update({
      where: { id },
      data: { website_token: crypto.randomBytes(16).toString('hex') },
    })
    res.json({ success: true, data: { id: channel.id, website_token: channel.website_token } })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Channel not found' })
    logger.error('Widget channel rotate error:', err)
    res.status(500).json({ success: false, message: 'Failed to rotate token' })
  }
})

export default router
