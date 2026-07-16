import { Router } from 'express'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { getIO } from '../socket.js'
import logger from '../logger.js'
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

router.post('/:id/messages', async (req, res) => {
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
    for (const p of participants) {
      await createNotification({
        userId: p.sender_id,
        type: 'chat_message',
        title: req.user.name || 'User',
        body: text,
        link: `/chats/${req.params.id}`,
      })
    }
    getIO()?.to(`chat:${req.params.id}`).emit('message:new', msg)
    res.status(201).json({ success: true, data: msg })
  } catch (err) {
    logger.error('Send message error:', err)
    res.status(500).json({ message: 'Failed to send message' })
  }
})

router.put('/:id/read', async (req, res) => {
  try {
    await markRead(Number(req.params.id))
    getIO()?.to(`chat:${req.params.id}`).emit('chat:read', { chatId: Number(req.params.id), userId: req.user.userId })
    res.json({ success: true, data: { ok: true } })
  } catch {
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
