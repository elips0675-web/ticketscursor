import { Router } from 'express'
import crypto from 'node:crypto'
import prisma from '../prisma.js'
import logger from '../logger.js'
import { isFeatureEnabled } from '../feature-flags.js'
import { enqueueEvent } from '../outbox.js'

const router = Router()

const MAX_TEXT = 4000
const MAX_NAME = 120
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function loadChannel(token) {
  if (!token || typeof token !== 'string' || token.length > 64) return null
  if (!(await isFeatureEnabled('chat_widget'))) return null
  const channel = await prisma.widget_channels.findUnique({ where: { website_token: token } })
  if (!channel || !channel.enabled) return null
  return channel
}

async function loadConversation(channel, conversationToken) {
  if (!conversationToken || typeof conversationToken !== 'string' || conversationToken.length > 64) return null
  const conversation = await prisma.widget_conversations.findUnique({
    where: { visitor_token: conversationToken },
  })
  if (!conversation || conversation.channel_id !== channel.id) return null
  return conversation
}

function publicMessage(message) {
  return {
    id: message.id,
    sender_type: message.sender_type,
    sender_name: message.sender_name,
    text: message.text,
    content_type: message.content_type ?? 'text',
    rich_payload: message.rich_payload ?? null,
    created_at: message.created_at,
  }
}

router.get('/default', async (req, res) => {
  try {
    if (!(await isFeatureEnabled('chat_widget'))) {
      return res.status(404).json({ success: false, message: 'Widget disabled' })
    }
    const channel = await prisma.widget_channels.findFirst({
      where: { enabled: true },
      orderBy: { id: 'asc' },
    })
    if (!channel) return res.status(404).json({ success: false, message: 'Widget not found' })
    res.json({
      success: true,
      data: {
        token: channel.website_token,
        name: channel.name,
        color: channel.color || '#1f93ff',
      },
    })
  } catch (err) {
    logger.error('Widget default channel error:', err)
    res.status(500).json({ success: false, message: 'Failed to load widget' })
  }
})

router.get('/:token/config', async (req, res) => {
  try {
    const channel = await loadChannel(req.params.token)
    if (!channel) return res.status(404).json({ success: false, message: 'Widget not found' })
    res.json({
      success: true,
      data: {
        name: channel.name,
        welcome: channel.welcome_message || '',
        offline: channel.offline_message || '',
        color: channel.color || '#1f93ff',
      },
    })
  } catch (err) {
    logger.error('Widget config error:', err)
    res.status(500).json({ success: false, message: 'Failed to load widget' })
  }
})

router.post('/:token/conversations', async (req, res) => {
  try {
    const channel = await loadChannel(req.params.token)
    if (!channel) return res.status(404).json({ success: false, message: 'Widget not found' })

    const { visitor_id, name, email } = req.body || {}
    if (typeof visitor_id !== 'string' || visitor_id.length < 8 || visitor_id.length > 64) {
      return res.status(400).json({ success: false, message: 'visitor_id is required' })
    }
    if (name !== undefined && name !== null && (typeof name !== 'string' || name.length > MAX_NAME)) {
      return res.status(400).json({ success: false, message: 'Invalid name' })
    }
    if (email && (typeof email !== 'string' || email.length > 255 || !EMAIL_RE.test(email))) {
      return res.status(400).json({ success: false, message: 'Invalid email' })
    }

    const visitorName = (name || '').trim() || 'Гость'
    const conversation = await prisma.widget_conversations.create({
      data: {
        channel_id: channel.id,
        visitor_id,
        visitor_token: crypto.randomBytes(24).toString('hex'),
        visitor_name: visitorName,
        visitor_email: email ? email.trim().toLowerCase() : null,
        status: 'open',
      },
    })

    res.status(201).json({
      success: true,
      data: {
        token: conversation.visitor_token,
        name: conversation.visitor_name,
        status: conversation.status,
        created_at: conversation.created_at,
      },
    })
  } catch (err) {
    logger.error('Widget conversation create error:', err)
    res.status(500).json({ success: false, message: 'Failed to start conversation' })
  }
})

router.get('/:token/conversations/:conversationToken', async (req, res) => {
  try {
    const channel = await loadChannel(req.params.token)
    if (!channel) return res.status(404).json({ success: false, message: 'Widget not found' })
    const conversation = await loadConversation(channel, req.params.conversationToken)
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' })

    const after = Number(req.query.after)
    const where = { conversation_id: conversation.id }
    if (Number.isFinite(after) && after > 0) where.id = { gt: after }

    const messages = await prisma.widget_messages.findMany({
      where,
      orderBy: { created_at: 'asc' },
      take: 500,
    })

    res.json({
      success: true,
      data: {
        name: conversation.visitor_name,
        status: conversation.status,
        messages: messages.map(publicMessage),
      },
    })
  } catch (err) {
    logger.error('Widget conversation load error:', err)
    res.status(500).json({ success: false, message: 'Failed to load conversation' })
  }
})

router.post('/:token/conversations/:conversationToken/messages', async (req, res) => {
  try {
    const channel = await loadChannel(req.params.token)
    if (!channel) return res.status(404).json({ success: false, message: 'Widget not found' })
    const conversation = await loadConversation(channel, req.params.conversationToken)
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' })
    if (conversation.status !== 'open') {
      return res.status(409).json({ success: false, message: 'Conversation is closed' })
    }

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!text) return res.status(400).json({ success: false, message: 'Text is required' })
    if (text.length > MAX_TEXT) {
      return res.status(400).json({ success: false, message: `Text too long (max ${MAX_TEXT} chars)` })
    }

    const message = await prisma.widget_messages.create({
      data: {
        conversation_id: conversation.id,
        sender_type: 'visitor',
        sender_name: conversation.visitor_name,
        text,
      },
    })
    await prisma.widget_conversations.update({
      where: { id: conversation.id },
      data: { unread_for_agent: { increment: 1 }, last_message_at: new Date() },
    })

    enqueueEvent('widget:message', 'agents', {
      conversationId: conversation.id,
      visitorName: conversation.visitor_name,
      message: publicMessage(message),
    })

    res.status(201).json({ success: true, data: publicMessage(message) })
  } catch (err) {
    logger.error('Widget message create error:', err)
    res.status(500).json({ success: false, message: 'Failed to send message' })
  }
})

export default router
