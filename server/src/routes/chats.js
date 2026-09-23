import { Router } from 'express'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import logger from '../logger.js'
import { idempotent } from '../middleware/idempotency.js'
import { enqueueEvent } from '../outbox.js'
import { getChats, getChatById, createMessage, getChatParticipants, markRead, findOrCreatePersonalChat } from '../services/chats.service.js'

const router = Router()
router.use(authenticateToken)
router.use(auditLogMiddleware)
router.use(requireRole('agent'))

router.get('/', async (req, res) => {
  try {
    const data = await getChats()
    res.json({ success: true, data })
  } catch (err) {
    logger.error('Chats list error:', err)
    res.status(500).json({ message: 'Failed to fetch chats' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const chat = await getChatById(Number(req.params.id), page, limit)
    if (!chat) return res.status(404).json({ message: 'Chat not found' })
    res.json({ success: true, data: chat })
  } catch (err) {
    logger.error('Chat detail error:', err)
    res.status(500).json({ message: 'Failed to fetch chat' })
  }
})

router.post('/:id/messages', idempotent, async (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ message: 'Text required' })
  if (text.length > 2000) return res.status(400).json({ message: 'Text too long (max 2000 chars)' })
  try {
    const msg = await createMessage({
      chatId: Number(req.params.id),
      userId: req.user.userId,
      userName: req.user.name || 'User',
      text,
    })
    const participants = await getChatParticipants(Number(req.params.id), req.user.userId)
    const { createNotification } = await import('./notifications.js')
    await Promise.all(participants.map(p => createNotification({
      userId: p.sender_id,
      type: 'chat_message',
      title: req.user.name || 'User',
      body: text,
      link: `/chats/${req.params.id}`,
    })))
    enqueueEvent('message:new', `chat:${req.params.id}`, msg)
    res.status(201).json({ success: true, data: msg })
  } catch (err) {
    logger.error('Send message error:', err)
    res.status(500).json({ message: 'Failed to send message' })
  }
})

router.put('/:id/read', async (req, res) => {
  try {
    const lastReadMessageId = Number(req.body?.lastReadMessageId) || null
    const receipt = await markRead(Number(req.params.id), req.user.userId, lastReadMessageId)
    enqueueEvent('chat:read', `chat:${req.params.id}`, {
      chatId: Number(req.params.id),
      userId: req.user.userId,
      lastReadMessageId: receipt?.last_read_message_id ?? null,
      lastReadAt: receipt?.last_read_at ?? new Date().toISOString(),
    })
    res.json({ success: true, data: receipt })
  } catch (err) {
    logger.error('Chat mark read error:', err)
    res.status(500).json({ message: 'Failed to mark read' })
  }
})

router.post('/personal/:userId', async (req, res) => {
  const { userId } = req.params
  const myId = req.user.userId
  if (Number(userId) === myId) return res.status(400).json({ message: 'Cannot chat with yourself' })
  try {
    const result = await findOrCreatePersonalChat(Number(userId), myId)
    if (result.error) return res.status(404).json({ message: result.error })
    const statusCode = result.created ? 201 : 200
    res.status(statusCode).json({ success: true, data: result.chat })
  } catch (err) {
    logger.error('Create personal chat error:', err)
    res.status(500).json({ message: 'Failed to create chat' })
  }
})

export default router
