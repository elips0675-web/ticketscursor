import { Router } from 'express'
import pool from '../db.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { createCalendarValidation, deleteEventValidation } from '../validate.js'

const router = Router()
router.use(authenticateToken)

router.get('/', async (req, res) => {
  const { year, month } = req.query
  try {
    let query = 'SELECT id, title, date, time, description, creator_id as creatorId, created_at as createdAt FROM events WHERE 1=1'
    const params = []
    if (year && month) {
      query += ' AND YEAR(date) = ? AND MONTH(date) = ?'
      params.push(Number(year), Number(month))
    }
    query += ' ORDER BY date, time ASC'
    const [events] = await pool.query(query, params)
    res.json(events)
  } catch (err) {
    console.error('Calendar list error:', err)
    res.status(500).json({ message: 'Failed to fetch events' })
  }
})

router.post('/', createCalendarValidation, async (req, res) => {
  const { title, date, time, description } = req.body
  try {
    const [result] = await pool.query(
      'INSERT INTO events (title, date, time, description, creator_id) VALUES (?, ?, ?, ?, ?)',
      [title, date, time || null, description || '', req.user.userId],
    )
    const [[event]] = await pool.query(
      'SELECT id, title, date, time, description, creator_id as creatorId, created_at as createdAt FROM events WHERE id = ?',
      [result.insertId],
    )
    res.status(201).json(event)
  } catch (err) {
    console.error('Create event error:', err)
    res.status(500).json({ message: 'Failed to create event' })
  }
})

router.delete('/:id', requireRole('admin', 'senior_agent'), deleteEventValidation, async (req, res) => {
  try {
    await pool.query('DELETE FROM events WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete event' })
  }
})

export default router
