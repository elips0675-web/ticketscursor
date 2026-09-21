import { Router } from 'express'
import { authenticateToken, requireRole } from '../middleware.js'
import { createRule, updateRule, deleteRule, listRules, AVAILABLE_TRIGGERS, AVAILABLE_ACTIONS } from '../services/rules.service.js'
import logger from '../logger.js'

const router = Router()

router.use(authenticateToken, requireRole('admin', 'super_admin'))

router.get('/triggers', (req, res) => {
  res.json({ success: true, data: AVAILABLE_TRIGGERS })
})

router.get('/actions', (req, res) => {
  res.json({ success: true, data: AVAILABLE_ACTIONS })
})

router.get('/', async (req, res) => {
  try {
    const rules = await listRules()
    res.json({ success: true, data: rules })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list rules' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, trigger_event, conditions, actions } = req.body
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' })
    if (!trigger_event) return res.status(400).json({ success: false, message: 'Trigger event is required' })
    if (!AVAILABLE_TRIGGERS.includes(trigger_event)) {
      return res.status(400).json({ success: false, message: `Invalid trigger. Available: ${AVAILABLE_TRIGGERS.join(', ')}` })
    }

    const rule = await createRule({
      name: name.trim(),
      triggerEvent: trigger_event,
      conditions,
      actions,
      createdBy: req.user.userId,
    })
    res.status(201).json({ success: true, data: rule })
  } catch (err) {
    logger.error('Create rule error:', err)
    res.status(500).json({ success: false, message: 'Failed to create rule' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (req.body.trigger_event && !AVAILABLE_TRIGGERS.includes(req.body.trigger_event)) {
      return res.status(400).json({ success: false, message: `Invalid trigger. Available: ${AVAILABLE_TRIGGERS.join(', ')}` })
    }

    const rule = await updateRule(Number(req.params.id), req.body)
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' })
    res.json({ success: true, data: rule })
  } catch (err) {
    logger.error('Update rule error:', err)
    res.status(500).json({ success: false, message: 'Failed to update rule' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteRule(Number(req.params.id))
    if (!result) return res.status(404).json({ success: false, message: 'Rule not found' })
    res.json({ success: true, message: 'Rule deleted' })
  } catch (err) {
    logger.error('Delete rule error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete rule' })
  }
})

export default router
