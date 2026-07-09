import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import knex from '../db.js'
import { JWT_SECRET, authenticateToken, requireRole } from '../middleware.js'
import { sendTicketNotification } from '../email.js'
import { loginValidation, registerValidation, changePasswordValidation } from '../validate.js'
import { authenticateLDAP } from '../auth/ldap.js'
import logger from '../logger.js'

const router = Router()
const REFRESH_SECRET = process.env.REFRESH_SECRET || process.env.JWT_SECRET + '-refresh'

function generateTokens(user) {
  const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign({ userId: user.id, tokenId: crypto.randomUUID() }, REFRESH_SECRET, { expiresIn: '7d' })
  return { accessToken, refreshToken }
}

router.post('/login', loginValidation, async (req, res) => {
  const { email, password } = req.body
  try {
    const [rows] = await knex.raw(
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
    const { accessToken, refreshToken } = generateTokens(employee)
    await knex.raw(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [employee.id, refreshToken],
    )
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    res.json({
      token: accessToken,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
      },
    })
  } catch (err) {
    logger.error('Login error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.post('/register', authenticateToken, requireRole('super_admin', 'admin'), registerValidation, async (req, res) => {
  const { name, email, password, department, title } = req.body
  try {
    const [existing] = await knex.raw('SELECT id FROM employees WHERE email = ?', [email])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Пользователь с таким email уже существует' })
    }
    const hash = await bcrypt.hash(password, 10)
    const [result] = await knex.raw(
      'INSERT INTO employees (name, email, password_hash, role, department, title, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [name, email, hash, 'agent', department || '', title || 'Сотрудник'],
    )
    res.status(201).json({
      employee: { id: result.insertId, name, email, role: 'agent' },
    })
  } catch (err) {
    logger.error('Register error:', err)
    res.status(500).json({ message: 'Ошибка регистрации' })
  }
})

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken
  if (!token) return res.status(401).json({ message: 'No refresh token' })
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET)
    const [rows] = await knex.raw(
      'SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > NOW()',
      [token, decoded.userId],
    )
    if (rows.length === 0) return res.status(403).json({ message: 'Invalid refresh token' })
    await knex.raw('DELETE FROM refresh_tokens WHERE token = ?', [token])
    const [userRows] = await knex.raw('SELECT id, name, email, role FROM employees WHERE id = ? AND is_active = 1', [decoded.userId])
    if (userRows.length === 0) return res.status(403).json({ message: 'User not found' })
    const user = userRows[0]
    const { accessToken, refreshToken } = generateTokens(user)
    await knex.raw(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [user.id, refreshToken],
    )
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    res.json({ token: accessToken })
  } catch {
    res.status(403).json({ message: 'Invalid refresh token' })
  }
})

router.post('/ldap-login', authenticateLDAP)

router.post('/dev-login', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' })
  }
  const token = jwt.sign({ userId: 1, role: 'super_admin' }, JWT_SECRET, { expiresIn: '15m' })
  res.json({ token, employee: { id: 1, name: 'Алексей Петров', email: 'alexey@example.com', role: 'super_admin' } })
})

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email required' })
  }
  try {
    const [rows] = await knex.raw('SELECT id, name FROM employees WHERE email = ?', [email])
    if (rows.length === 0) return res.json({ message: 'If the email exists, a reset link has been sent' })

    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await knex.raw(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)',
      [email, resetToken, expiresAt],
    )

    const resetUrl = `${req.headers.origin || 'http://localhost:5173'}/reset-password?token=${resetToken}`
    await sendTicketNotification({
      to: email,
      subject: 'Сброс пароля — Service Desk',
      text: `Перейдите по ссылке для сброса пароля:\n\n${resetUrl}\n\nСсылка действительна 1 час.`,
    })
    res.json({ message: 'If the email exists, a reset link has been sent' })
  } catch (err) {
    logger.error('Forgot password error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.post('/reset-password', changePasswordValidation, async (req, res) => {
  const { token, password } = req.body
  try {
    const [rows] = await knex.raw(
      'SELECT email FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token],
    )
    if (rows.length === 0) return res.status(400).json({ message: 'Invalid or expired token' })

    const hash = await bcrypt.hash(password, 10)
    await knex.raw('UPDATE employees SET password_hash = ? WHERE email = ?', [hash, rows[0].email])
    await knex.raw('DELETE FROM password_resets WHERE token = ?', [token])
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    logger.error('Reset password error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router
