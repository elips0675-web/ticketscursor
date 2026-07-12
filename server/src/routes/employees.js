import { Router } from 'express'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import logger from '../logger.js'
import { listEmployees, getStats } from '../services/employees.service.js'

const router = Router()
router.use(authenticateToken)
router.use(auditLogMiddleware)
router.use(requireRole('agent'))

router.get('/', async (req, res) => {
  try {
    const data = await listEmployees()
    res.json({ success: true, data })
  } catch (err) {
    logger.error('Employees list error:', err)
    res.status(500).json({ message: 'Failed to fetch employees' })
  }
})

router.get('/stats', async (req, res) => {
  try {
    const data = await getStats()
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ message: 'Failed to fetch stats' })
  }
})

export default router
