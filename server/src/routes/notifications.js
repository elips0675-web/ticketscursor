import { Router } from 'express'
import prisma from '../prisma.js'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken } from '../middleware.js'
import logger from '../logger.js'
import { enqueueEvent } from '../outbox.js'
import {
  NOTIF_EVENTS,
  NOTIF_CHANNELS,
  normalizePrefs,
  getPrefsForUser,
  invalidateNotificationPrefsCache,
} from '../notification-prefs.js'

const router = Router()
router.use(authenticateToken)
router.use(auditLogMiddleware)

router.get('/preferences', async (req, res) => {
  try {
    const prefs = await getPrefsForUser(req.user.userId)
    res.json({ success: true, data: { prefs, events: NOTIF_EVENTS, channels: NOTIF_CHANNELS } })
  } catch (err) {
    logger.error('Notification preferences get error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch notification preferences' })
  }
})

router.put('/preferences', async (req, res) => {
  const { valid, prefs, error } = normalizePrefs(req.body)
  if (!valid) return res.status(400).json({ success: false, message: error })
  try {
    await prisma.notification_preferences.upsert({
      where: { user_id: req.user.userId },
      update: { prefs: JSON.stringify(prefs), updated_at: new Date() },
      create: { user_id: req.user.userId, prefs: JSON.stringify(prefs) },
    })
    invalidateNotificationPrefsCache(req.user.userId)
    res.json({ success: true, data: { prefs } })
  } catch (err) {
    logger.error('Notification preferences save error:', err)
    res.status(500).json({ success: false, message: 'Failed to save notification preferences' })
  }
})

export async function createNotification({ userId, type, title, body, link }) {
  if (!userId) return
  try {
    const notif = await prisma.notifications.create({
      data: { user_id: userId, type, title, body, link },
    })
    enqueueEvent(`notification:${userId}`, null, notif)
  } catch (err) {
    logger.error('Notification create error:', err)
  }
}

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.notifications.findMany({
      where: { user_id: req.user.userId },
      orderBy: { created_at: 'desc' },
      take: 50,
    })
    res.json({ success: true, data: rows })
  } catch (err) {
    logger.error('Notifications list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' })
  }
})

router.put('/:id/read', async (req, res) => {
  try {
    const result = await prisma.notifications.updateMany({
      where: { id: Number(req.params.id), user_id: req.user.userId },
      data: { is_read: true },
    })
    res.json({ success: true, data: { updated: result.count } })
  } catch (err) {
    logger.error('Notification mark read error:', err)
    res.status(500).json({ success: false, message: 'Failed to mark as read' })
  }
})

router.put('/read-all', async (req, res) => {
  try {
    const result = await prisma.notifications.updateMany({
      where: { user_id: req.user.userId },
      data: { is_read: true },
    })
    res.json({ success: true, data: { updated: result.count } })
  } catch (err) {
    logger.error('Notifications mark all read error:', err)
    res.status(500).json({ success: false, message: 'Failed to mark all as read' })
  }
})

router.delete('/clear-all', async (req, res) => {
  try {
    const result = await prisma.notifications.deleteMany({ where: { user_id: req.user.userId } })
    res.json({ success: true, data: { deleted: result.count } })
  } catch (err) {
    logger.error('Notifications clear error:', err)
    res.status(500).json({ success: false, message: 'Failed to clear notifications' })
  }
})

export default router
