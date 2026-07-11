import { Router } from 'express'
import prisma from '../prisma.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { invalidateCache as invalidateSettingsCache } from '../settings.js'
import logger from '../logger.js'

const router = Router()
router.use(authenticateToken, requireRole('admin'))

const ALLOWED_SETTINGS = [
  'TELEGRAM_BOT_TOKEN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'COMPANY_NAME', 'COMPANY_LOGO', 'TIMEZONE', 'DEFAULT_LANGUAGE',
  'AUTO_ASSIGN', 'SLA_RESPONSE_HOURS',
  'LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_DN', 'LDAP_BIND_CREDENTIALS',
]

router.get('/settings', async (req, res) => {
  try {
    const rows = await prisma.admin_settings.findMany({ select: { key: true, value: true } })
    const settings = {}
    for (const r of rows) settings[r.key] = r.value
    res.json({ success: true, data: settings })
  } catch (err) {
    logger.error('Settings get error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch settings' })
  }
})

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      if (!ALLOWED_SETTINGS.includes(key)) continue
      await prisma.admin_settings.upsert({
        where: { key },
        update: { value: String(value), updated_at: new Date() },
        create: { key, value: String(value), updated_at: new Date() },
      })
    }
    invalidateSettingsCache()
    res.json({ success: true, data: { updated: true } })
  } catch (err) {
    logger.error('Settings update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update settings' })
  }
})

router.get('/users', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT id, name, email, role, department, title, avatar, phone,
        online, active_tickets as activeTickets, resolved_today as resolvedToday,
        is_active as isActive, created_at as createdAt
      FROM employees ORDER BY is_active DESC, name
    `
    const data = rows.map(r => ({
      ...r,
      id: Number(r.id),
      activeTickets: Number(r.activeTickets),
      resolvedToday: Number(r.resolvedToday),
    }))
    res.json({ success: true, data })
  } catch (err) {
    logger.error('Admin users list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch users' })
  }
})

router.put('/users/:id', async (req, res) => {
  const targetId = Number(req.params.id)
  if (targetId === req.user.userId) {
    return res.status(400).json({ success: false, message: 'Cannot modify your own account' })
  }
  const { role, isActive, department, title } = req.body
  const data = {}
  if (role && ['admin', 'senior_agent', 'agent', 'requester'].includes(role)) {
    data.role = role
  }
  if (isActive !== undefined) {
    data.is_active = Boolean(isActive)
  }
  if (department !== undefined) {
    data.department = department
  }
  if (title !== undefined) {
    data.title = title
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ success: false, message: 'No fields to update' })
  try {
    await prisma.employees.update({ where: { id: targetId }, data })
    res.json({ success: true, data: { updated: true } })
  } catch (err) {
    logger.error('Admin user update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update user' })
  }
})

router.get('/audit', async (req, res) => {
  const { entityType, entityId, limit = 50, offset = 0 } = req.query
  try {
    const where = {}
    if (entityType) where.entity_type = entityType
    if (entityId) where.entity_id = Number(entityId)
    const rows = await prisma.audit_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: Number(offset),
      take: Number(limit),
    })
    res.json({ success: true, data: rows })
  } catch (err) {
    logger.error('Audit log error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' })
  }
})

export default router
