import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { body } from 'express-validator'
import pool from '../db.js'
import { JWT_SECRET, authenticateToken, requireRole } from '../middleware.js'
import { sendTicketNotification } from '../email.js'
import { loginValidation, registerValidation, handleErrors } from '../validate.js'

const router = Router()

router.post('/login', loginValidation, async (req, res) => {
  const { email, password } = req.body
  try {
    const [rows] = await pool.query(
      'SELECT id, email, name, role, password_hash FROM employees WHERE email = ? AND is_active = 1',
      [email],
    )
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    const employee = rows[0]
    const valid = await bcrypt.compare(password, employee.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    const token = jwt.sign({ userId: employee.id, role: employee.role }, JWT_SECRET, { expiresIn: '24h' })
    res.json({
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.post('/register', authenticateToken, requireRole('admin'), registerValidation, async (req, res) => {
  const { name, email, password, department, title } = req.body
  try {
    const [existing] = await pool.query('SELECT id FROM employees WHERE email = ?', [email])
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
    }
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      'INSERT INTO employees (name, email, password_hash, role, department, title, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [name, email, hash, 'agent', department || '', title || 'Сотрудник'],
    )
    const token = jwt.sign({ userId: result.insertId, role: 'agent' }, JWT_SECRET, { expiresIn: '24h' })
    res.status(201).json({
      token,
      employee: { id: result.insertId, name, email, role: 'agent' },
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Ошибка регистрации' })
  }
})

// Dev auto-login
router.post('/dev-login', async (req, res) => {
  const token = jwt.sign({ userId: 1, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, employee: { id: 1, name: 'Алексей Петров', email: 'alexey@example.com', role: 'admin' } })
})

router.post('/forgot-password', body('email').isEmail(), handleErrors, async (req, res) => {
  const { email } = req.body
  try {
    const [rows] = await pool.query('SELECT id, name FROM employees WHERE email = ?', [email])
    if (rows.length === 0) return res.json({ message: 'If the email exists, a reset link has been sent' })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await pool.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)',
      [email, token, expiresAt],
    )

    const resetUrl = `${req.headers.origin || 'http://localhost:5173'}/reset-password?token=${token}`
    await sendTicketNotification({
      to: email,
      subject: 'Сброс пароля — Service Desk',
      text: `Перейдите по ссылке для сброса пароля:\n\n${resetUrl}\n\nСсылка действительна 1 час.`,
    })
    res.json({ message: 'If the email exists, a reset link has been sent' })
  } catch (err) {
    console.error('Forgot password error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.post('/reset-password', body('token').isLength({ min: 1 }), body('password').isLength({ min: 6 }), handleErrors, async (req, res) => {
  const { token, password } = req.body
  try {
    const [rows] = await pool.query(
      'SELECT email FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token],
    )
    if (rows.length === 0) return res.status(400).json({ message: 'Invalid or expired token' })

    const hash = await bcrypt.hash(password, 10)
    await pool.query('UPDATE employees SET password_hash = ? WHERE email = ?', [hash, rows[0].email])
    await pool.query('DELETE FROM password_resets WHERE token = ?', [token])
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router
