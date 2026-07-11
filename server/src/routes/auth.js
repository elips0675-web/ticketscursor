import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../prisma.js'
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
    const employee = await prisma.employees.findFirst({
      where: { email, is_active: true },
      select: { id: true, email: true, name: true, role: true, password_hash: true },
    })
    if (!employee) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    const valid = await bcrypt.compare(password, employee.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    const { accessToken, refreshToken } = generateTokens(employee)
    await prisma.refresh_tokens.create({
      data: { user_id: employee.id, token: refreshToken, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    res.json({ success: true, data: { token: accessToken, employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role } } })
  } catch (err) {
    logger.error('Login error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.post('/register', authenticateToken, requireRole('super_admin', 'admin'), registerValidation, async (req, res) => {
  const { name, email, password, department, title } = req.body
  try {
    const existing = await prisma.employees.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return res.status(409).json({ message: 'Пользователь с таким email уже существует' })
    }
    const hash = await bcrypt.hash(password, 10)
    const employee = await prisma.employees.create({
      data: { name, email, password_hash: hash, role: 'agent', department: department || '', title: title || 'Сотрудник', is_active: true },
    })
    res.status(201).json({ success: true, data: { employee: { id: employee.id, name: employee.name, email: employee.email, role: 'agent' } } })
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
    const stored = await prisma.refresh_tokens.findFirst({
      where: { token, user_id: decoded.userId, expires_at: { gt: new Date() } },
    })
    if (!stored) return res.status(403).json({ message: 'Invalid refresh token' })
    await prisma.refresh_tokens.delete({ where: { id: stored.id } })
    const user = await prisma.employees.findFirst({
      where: { id: decoded.userId, is_active: true },
      select: { id: true, name: true, email: true, role: true },
    })
    if (!user) return res.status(403).json({ message: 'User not found' })
    const { accessToken, refreshToken } = generateTokens(user)
    await prisma.refresh_tokens.create({
      data: { user_id: user.id, token: refreshToken, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    res.json({ success: true, data: { token: accessToken } })
  } catch {
    res.status(403).json({ message: 'Invalid refresh token' })
  }
})

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (token) {
      await prisma.refresh_tokens.deleteMany({ where: { token } })
    }
    res.clearCookie('refreshToken', { path: '/api/auth' })
    res.json({ success: true, message: 'Logged out' })
  } catch (err) {
    logger.error('Logout error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.post('/ldap-login', authenticateLDAP)

router.post('/dev-login', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' })
  }
  const token = jwt.sign({ userId: 1, role: 'super_admin' }, JWT_SECRET, { expiresIn: '15m' })
  res.json({ success: true, data: { token, employee: { id: 1, name: 'Алексей Петров', email: 'alexey@example.com', role: 'super_admin' } } })
})

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email required' })
  }
  try {
    const user = await prisma.employees.findFirst({ where: { email }, select: { id: true, name: true } })
    if (!user) return res.json({ message: 'If the email exists, a reset link has been sent' })

    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await prisma.password_resets.upsert({
      where: { email },
      update: { token: resetToken, expires_at: expiresAt },
      create: { email, token: resetToken, expires_at: expiresAt },
    })

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
    const reset = await prisma.password_resets.findFirst({
      where: { token, expires_at: { gt: new Date() } },
    })
    if (!reset) return res.status(400).json({ message: 'Invalid or expired token' })

    const hash = await bcrypt.hash(password, 10)
    await prisma.employees.update({ where: { email: reset.email }, data: { password_hash: hash } })
    await prisma.password_resets.delete({ where: { id: reset.id } })
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    logger.error('Reset password error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router
