import { Router } from 'express'
import { authenticateToken, requireRole } from '../middleware.js'
import { createRecurrence, updateRecurrence, deleteRecurrence, listRecurrences, getRecurrenceById } from '../services/recurrence.service.js'
import { CronExpressionParser } from 'cron-parser'
import logger from '../logger.js'

const router = Router()

router.use(authenticateToken, requireRole('admin', 'senior_agent'))

router.get('/', async (req, res) => {
  try {
    const recurrences = await listRecurrences()
    res.json({ success: true, data: recurrences })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list recurrences' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const rec = await getRecurrenceById(Number(req.params.id))
    if (!rec) return res.status(404).json({ success: false, message: 'Recurrence not found' })
    res.json({ success: true, data: rec })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get recurrence' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { title, description, priority, category, assigned_to, cron_expr } = req.body
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Title is required' })
    if (!cron_expr?.trim()) return res.status(400).json({ success: false, message: 'Cron expression is required' })

    try {
      CronExpressionParser.parse(cron_expr)
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid cron expression' })
    }

    const rec = await createRecurrence({
      title: title.trim(),
      description,
      priority,
      category,
      assignedTo: assigned_to,
      cronExpr: cron_expr.trim(),
      createdBy: req.user.userId,
    })
    res.status(201).json({ success: true, data: rec })
  } catch (err) {
    logger.error('Create recurrence error:', err)
    res.status(500).json({ success: false, message: 'Failed to create recurrence' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (req.body.cron_expr) {
      try {
        CronExpressionParser.parse(req.body.cron_expr)
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid cron expression' })
      }
    }

    const rec = await updateRecurrence(Number(req.params.id), req.body)
    if (!rec) return res.status(404).json({ success: false, message: 'Recurrence not found' })
    res.json({ success: true, data: rec })
  } catch (err) {
    logger.error('Update recurrence error:', err)
    res.status(500).json({ success: false, message: 'Failed to update recurrence' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteRecurrence(Number(req.params.id))
    if (!result) return res.status(404).json({ success: false, message: 'Recurrence not found' })
    res.json({ success: true, message: 'Recurrence deleted' })
  } catch (err) {
    logger.error('Delete recurrence error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete recurrence' })
  }
})

export default router
