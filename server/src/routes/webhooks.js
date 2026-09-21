import { Router } from 'express'
import { authenticateToken, requireRole } from '../middleware.js'
import { createWebhook, updateWebhook, deleteWebhook, listWebhooks, AVAILABLE_EVENTS } from '../services/webhooks.service.js'

const router = Router()

router.use(authenticateToken, requireRole('admin', 'super_admin'))

router.get('/events', (req, res) => {
  res.json({ success: true, data: AVAILABLE_EVENTS })
})

router.get('/', async (req, res) => {
  try {
    const hooks = await listWebhooks()
    res.json({ success: true, data: hooks })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list webhooks' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, url, secret, events } = req.body
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' })
    if (!url?.trim()) return res.status(400).json({ success: false, message: 'URL is required' })
    if (!events?.length) return res.status(400).json({ success: false, message: 'At least one event is required' })

    const hook = await createWebhook({
      name: name.trim(),
      url: url.trim(),
      secret,
      events,
      createdBy: req.user.userId,
    })
    res.status(201).json({ success: true, data: hook })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create webhook' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const hook = await updateWebhook(Number(req.params.id), req.body)
    if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found' })
    res.json({ success: true, data: hook })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update webhook' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteWebhook(Number(req.params.id))
    if (!result) return res.status(404).json({ success: false, message: 'Webhook not found' })
    res.json({ success: true, message: 'Webhook deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete webhook' })
  }
})

export default router
