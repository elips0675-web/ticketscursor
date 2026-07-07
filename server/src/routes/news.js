import { Router } from 'express'
import pool from '../db.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { createNewsValidation } from '../validate.js'

const router = Router()
router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, content, important, author_id, author_name, created_at FROM news_posts ORDER BY important DESC, created_at DESC',
    )
    res.json(rows)
  } catch (err) {
    console.error('News list error:', err)
    res.status(500).json({ message: 'Failed to fetch news' })
  }
})

router.post('/', requireRole('admin', 'senior_agent'), createNewsValidation, async (req, res) => {
  const { title, content, important } = req.body
  try {
    const [result] = await pool.query(
      'INSERT INTO news_posts (title, content, important, author_id, author_name) VALUES (?, ?, ?, ?, ?)',
      [title, content, important || false, req.user.userId, req.user.name || 'User'],
    )
    const [[post]] = await pool.query('SELECT * FROM news_posts WHERE id = ?', [result.insertId])
    res.status(201).json(post)
  } catch (err) {
    console.error('Create news error:', err)
    res.status(500).json({ message: 'Failed to create news' })
  }
})

export default router
