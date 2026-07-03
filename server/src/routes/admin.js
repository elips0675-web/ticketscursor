import { Router } from 'express'
import pool from '../db.js'
import { authenticateToken, requireRole } from '../middleware.js'

const router = Router()
router.use(authenticateToken, requireRole('admin'))

const ALLOWED_SETTINGS = ['TELEGRAM_BOT_TOKEN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE']

router.get('/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT `key`, `value` FROM admin_settings')
    const settings = {}
    for (const r of rows) settings[r.key] = r.value
    res.json(settings)
  } catch (err) {
    console.error('Settings get error:', err)
    res.status(500).json({ message: 'Failed to fetch settings' })
  }
})

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      if (!ALLOWED_SETTINGS.includes(key)) continue
      await pool.query(
        'INSERT INTO admin_settings (`key`, `value`, `updated_at`) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()',
        [key, String(value)],
      )
    }
    res.json({ success: true })
  } catch (err) {
    console.error('Settings update error:', err)
    res.status(500).json({ message: 'Failed to update settings' })
  }
})

router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, department, title, avatar, phone,
              online, active_tickets as activeTickets, resolved_today as resolvedToday,
              is_active as isActive, created_at as createdAt
       FROM employees ORDER BY is_active DESC, name`,
    )
    res.json(rows)
  } catch (err) {
    console.error('Admin users list error:', err)
    res.status(500).json({ message: 'Failed to fetch users' })
  }
})

router.put('/users/:id', async (req, res) => {
  const { role, isActive, department, title } = req.body
  const updates = []
  const params = []
  if (role && ['admin', 'senior_agent', 'agent'].includes(role)) {
    updates.push('role = ?')
    params.push(role)
  }
  if (isActive !== undefined) {
    updates.push('is_active = ?')
    params.push(isActive ? 1 : 0)
  }
  if (department !== undefined) {
    updates.push('department = ?')
    params.push(department)
  }
  if (title !== undefined) {
    updates.push('title = ?')
    params.push(title)
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
  try {
    params.push(req.params.id)
    await pool.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error('Admin user update error:', err)
    res.status(500).json({ message: 'Failed to update user' })
  }
})

export default router
