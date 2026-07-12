import { Router } from 'express'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { createCalendarValidation, updateCalendarValidation, deleteEventValidation } from '../validate.js'
import logger from '../logger.js'
import { listEvents, createEvent, updateEvent, deleteEvent } from '../services/calendar.service.js'

const router = Router()
router.use(authenticateToken)
router.use(auditLogMiddleware)
router.use(requireRole('agent'))

router.get('/', async (req, res) => {
  const { year, month } = req.query
  try {
    const data = await listEvents(year, month)
    res.json({ success: true, data })
  } catch (err) {
    logger.error('Calendar list error:', err)
    res.status(500).json({ message: 'Failed to fetch events' })
  }
})

router.post('/', createCalendarValidation, async (req, res) => {
  const { title, date, time, description } = req.body
  try {
    const event = await createEvent({
      title, date, time, description, userId: req.user.userId,
    })
    res.status(201).json({ success: true, data: event })
    const { createNotification } = await import('./notifications.js')
    await createNotification({
      userId: req.user.userId,
      type: 'event',
      title: 'Событие создано',
      body: title,
      link: `/calendar`,
    })
  } catch (err) {
    logger.error('Create event error:', err)
    res.status(500).json({ message: 'Failed to create event' })
  }
})

router.put('/:id', requireRole('admin', 'senior_agent'), updateCalendarValidation, async (req, res) => {
  const { title, date, time, description } = req.body
  try {
    const event = await updateEvent(Number(req.params.id), { title, date, time, description })
    res.json({ success: true, data: event })
  } catch (err) {
    logger.error('Update event error:', err)
    res.status(500).json({ message: 'Failed to update event' })
  }
})

router.delete('/:id', requireRole('admin', 'senior_agent'), deleteEventValidation, async (req, res) => {
  try {
    await deleteEvent(Number(req.params.id))
    res.json({ success: true, data: { ok: true } })
  } catch {
    res.status(500).json({ message: 'Failed to delete event' })
  }
})

export default router
