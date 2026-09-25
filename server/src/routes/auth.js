import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../prisma.js'
import { JWT_SECRET, verifyJwtSecret, authenticateToken, requireRole } from '../middleware.js'
import { sendTicketNotification } from '../email.js'
import { loginValidation, registerValidation, changePasswordValidation } from '../validate.js'
import { authenticateLDAP } from '../auth/ldap.js'
import { initOIDCClient, getSSOConfig, isSSOEnabled, generateSSOState, generateSSONonce, getSSOAuthorizationUrl, handleSSOCallback } from '../auth/oidc.js'
import { generateTotpSecret, totpUri, verifyTotp } from '../auth/totp.js'
import { isFeatureEnabled } from '../feature-flags.js'
import { sessionMeta } from '../auth/session-meta.js'
import logger from '../logger.js'

const router = Router()
const REFRESH_SECRET = process.env.REFRESH_SECRET || process.env.JWT_SECRET + '-refresh'

function generateTokens(user, familyId) {
  const family = familyId || crypto.randomUUID()
  const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign({ userId: user.id, familyId: family, tokenId: crypto.randomUUID() }, REFRESH_SECRET, { expiresIn: '7d' })
  return { accessToken, refreshToken, familyId: family }
}

// Создание refresh-токена с метаданными сессии (device/ip/UA — подфича 2 «активные сессии»).
async function storeRefreshToken(userId, token, familyId, meta) {
  return prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token,
      family_id: familyId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      device_name: meta.device_name,
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
      last_seen_at: new Date(),
    },
  })
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

    // 2FA: если у пользователя включён TOTP — двухшаговый вход (tempToken живёт 5 минут)
    const totpRow = await prisma.user_totp.findUnique({ where: { user_id: employee.id } })
    if (totpRow?.enabled) {
      const tempToken = jwt.sign({ userId: employee.id, purpose: '2fa' }, JWT_SECRET, { expiresIn: '5m' })
      return res.json({ success: true, step: '2fa', tempToken })
    }

    const { accessToken, refreshToken, familyId } = generateTokens(employee)
    await storeRefreshToken(employee.id, refreshToken, familyId, sessionMeta(req))
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    const isAdmin = employee.role === 'admin' || employee.role === 'super_admin'
    const require2faSetup = isAdmin && (await isFeatureEnabled('two_fa'))
    res.json({
      success: true,
      data: {
        token: accessToken,
        employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role },
        require2faSetup,
      },
    })
  } catch (err) {
    logger.error('Login error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Второй шаг входа: проверка TOTP-кода, выдача JWT + refresh-токена
router.post('/2fa/verify', async (req, res) => {
  const { tempToken, code } = req.body || {}
  try {
    let decoded
    try {
      decoded = verifyJwtSecret(tempToken)
    } catch {
      return res.status(401).json({ message: 'Invalid or expired 2FA session' })
    }
    if (!decoded || decoded.purpose !== '2fa') {
      return res.status(401).json({ message: 'Invalid 2FA session' })
    }
    const employee = await prisma.employees.findFirst({
      where: { id: decoded.userId, is_active: true },
      select: { id: true, name: true, email: true, role: true },
    })
    if (!employee) {
      return res.status(401).json({ message: 'User not found' })
    }
    const totpRow = await prisma.user_totp.findUnique({ where: { user_id: employee.id } })
    if (!totpRow?.enabled || !verifyTotp(totpRow.secret, code)) {
      return res.status(401).json({ message: 'Invalid 2FA code', code: 'INVALID_2FA' })
    }
    const { accessToken, refreshToken, familyId } = generateTokens(employee)
    await storeRefreshToken(employee.id, refreshToken, familyId, sessionMeta(req))
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })
    res.json({
      success: true,
      data: { token: accessToken, employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role } },
    })
  } catch (err) {
    logger.error('2FA verify error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Статус 2FA текущего пользователя (для Profile)
router.get('/2fa/status', authenticateToken, async (req, res) => {
  try {
    const row = await prisma.user_totp.findUnique({ where: { user_id: req.user.userId } })
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin'
    res.json({
      success: true,
      data: {
        enabled: !!row?.enabled,
        secretSet: !!row?.secret,
        required: isAdmin && (await isFeatureEnabled('two_fa')),
      },
    })
  } catch (err) {
    logger.error('2FA status error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Генерация секрета + otpauth:// URI для QR-кода (только admin/super_admin)
router.post('/2fa/setup', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const secret = generateTotpSecret()
    const employee = await prisma.employees.findUnique({ where: { id: req.user.userId }, select: { email: true } })
    await prisma.user_totp.upsert({
      where: { user_id: req.user.userId },
      update: { secret, enabled: false, updated_at: new Date() },
      create: { user_id: req.user.userId, secret, enabled: false },
    })
    res.json({ success: true, data: { secret, otpauthUrl: totpUri(secret, employee?.email || '') } })
  } catch (err) {
    logger.error('2FA setup error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Включение 2FA после проверки кода
router.post('/2fa/enable', authenticateToken, requireRole('admin'), async (req, res) => {
  const { code } = req.body || {}
  try {
    const row = await prisma.user_totp.findUnique({ where: { user_id: req.user.userId } })
    if (!row) {
      return res.status(400).json({ message: 'Setup 2FA first' })
    }
    if (!verifyTotp(row.secret, code)) {
      return res.status(401).json({ message: 'Invalid 2FA code', code: 'INVALID_2FA' })
    }
    await prisma.user_totp.update({ where: { user_id: req.user.userId }, data: { enabled: true, updated_at: new Date() } })
    res.json({ success: true, data: { enabled: true } })
  } catch (err) {
    logger.error('2FA enable error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Отключение 2FA (требует действующий код)
router.post('/2fa/disable', authenticateToken, requireRole('admin'), async (req, res) => {
  const { code } = req.body || {}
  try {
    const row = await prisma.user_totp.findUnique({ where: { user_id: req.user.userId } })
    if (!row?.enabled) {
      return res.status(400).json({ message: '2FA is not enabled' })
    }
    if (!verifyTotp(row.secret, code)) {
      return res.status(401).json({ message: 'Invalid 2FA code', code: 'INVALID_2FA' })
    }
    await prisma.user_totp.update({ where: { user_id: req.user.userId }, data: { enabled: false, updated_at: new Date() } })
    res.json({ success: true, data: { enabled: false } })
  } catch (err) {
    logger.error('2FA disable error:', err)
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
    const hash = await bcrypt.hash(password, 12)
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
    if (!stored) {
      // Reuse украденного refresh-токена → отзываем всю семью сессий
      if (decoded.familyId) {
        await prisma.refresh_tokens.deleteMany({ where: { family_id: decoded.familyId } }).catch(() => {})
      }
      return res.status(403).json({ message: 'Invalid refresh token' })
    }
    await prisma.refresh_tokens.delete({ where: { id: stored.id } })
    const user = await prisma.employees.findFirst({
      where: { id: decoded.userId, is_active: true },
      select: { id: true, name: true, email: true, role: true },
    })
    if (!user) return res.status(403).json({ message: 'User not found' })
    const { accessToken, refreshToken, familyId } = generateTokens(user, stored.family_id)
    await storeRefreshToken(user.id, refreshToken, familyId, sessionMeta(req))
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

router.post('/revoke-all', authenticateToken, async (req, res) => {
  try {
    const { count } = await prisma.refresh_tokens.deleteMany({ where: { user_id: req.user.userId } })
    res.clearCookie('refreshToken', { path: '/api/auth' })
    res.json({ success: true, data: { revoked: count } })
  } catch (err) {
    logger.error('Revoke all error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Активные сессии (подфича 2, флаг user_sessions): список устройств текущего пользователя.
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const rows = await prisma.refresh_tokens.findMany({
      where: { user_id: req.user.userId, expires_at: { gt: new Date() } },
      orderBy: [{ last_seen_at: 'desc' }, { created_at: 'desc' }],
      take: 100,
    })
    const currentToken = req.cookies?.refreshToken || ''
    const sessions = rows.map((r) => ({
      id: r.id,
      device: r.device_name || 'Unknown device',
      ip: r.ip_address || '',
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at || r.created_at,
      current: r.token === currentToken,
    }))
    res.json({ success: true, data: { sessions } })
  } catch (err) {
    logger.error('Sessions list error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Отзыв ОДНОЙ сессии (только своей; текущую сессию отозвать нельзя — для этого /revoke-all).
router.post('/sessions/:id/revoke', authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid session id' })
    }
    const row = await prisma.refresh_tokens.findFirst({ where: { id, user_id: req.user.userId } })
    if (!row) return res.status(404).json({ message: 'Session not found' })
    if (row.token === (req.cookies?.refreshToken || '')) {
      return res.status(400).json({ message: 'Cannot revoke current session' })
    }
    await prisma.refresh_tokens.delete({ where: { id } })
    res.json({ success: true, data: { revoked: true } })
  } catch (err) {
    logger.error('Session revoke error:', err)
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

    const hash = await bcrypt.hash(password, 12)
    await prisma.employees.update({ where: { email: reset.email }, data: { password_hash: hash } })
    await prisma.password_resets.delete({ where: { id: reset.id } })
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    logger.error('Reset password error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

router.get('/sso/config', async (req, res) => {
  try {
    const enabled = await isSSOEnabled()
    const config = await getSSOConfig()
    res.json({
      success: true,
      data: {
        enabled,
        provider: config.SSO_PROVIDER || '',
        clientId: config.SSO_CLIENT_ID || '',
        issuerUrl: config.SSO_ISSUER_URL || '',
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get SSO config' })
  }
})

router.get('/sso/login', async (req, res) => {
  try {
    const enabled = await isSSOEnabled()
    if (!enabled) return res.status(400).json({ message: 'SSO is not configured' })

    const state = generateSSOState()
    const nonce = generateSSONonce()

    const sessionStore = globalThis.__ssoSessions || (globalThis.__ssoSessions = new Map())
    sessionStore.set(state, { nonce, createdAt: Date.now() })

    const authUrl = await getSSOAuthorizationUrl(state, nonce)
    if (!authUrl) return res.status(500).json({ message: 'Failed to generate SSO URL' })

    res.json({ success: true, data: { url: authUrl } })
  } catch (err) {
    logger.error('SSO login error:', err)
    res.status(500).json({ message: 'SSO login failed' })
  }
})

router.post('/sso/callback', async (req, res) => {
  const { code, state, error } = req.body
  if (error) return res.status(400).json({ message: `SSO error: ${error}` })
  if (!code || !state) return res.status(400).json({ message: 'Missing code or state' })

  const sessionStore = globalThis.__ssoSessions || new Map()
  const session = sessionStore.get(state)
  if (!session) return res.status(400).json({ message: 'Invalid or expired SSO state' })
  sessionStore.delete(state)

  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    return res.status(400).json({ message: 'SSO state expired (10 min limit)' })
  }

  try {
    const result = await handleSSOCallback(code, state, session.nonce)

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })

    res.json({
      success: true,
      data: {
        token: result.accessToken,
        employee: result.employee,
      },
    })
  } catch (err) {
    logger.error('SSO callback error:', err)
    res.status(500).json({ message: err.message || 'SSO authentication failed' })
  }
})

export default router
