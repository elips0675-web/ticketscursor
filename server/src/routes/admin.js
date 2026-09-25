import { Router } from 'express'
import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import prisma from '../prisma.js'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { getSettings, invalidateCache as invalidateSettingsCache } from '../settings.js'
import logger from '../logger.js'
import { cacheMiddleware, invalidateCache } from '../cache.js'
import {
  checkDatabase,
  checkRedis,
  checkMeili,
  checkSmtp,
  checkImap,
  getQueueStats,
  getMigrations,
  restoreBackup,
  reindexSearch,
} from '../services/admin-ops.js'
import { getRbacMatrix } from '../rbac.js'
import { getEmailTemplatePreview } from '../notify.js'
import { setRateLimitOverrides } from '../limits.js'
import { isFeatureEnabled, invalidateFeatureFlagCache } from '../feature-flags.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..', '..')

const router = Router()
router.use(authenticateToken, requireRole('admin'))
// require2FA: при включённом флаге two_fa admin/super_admin обязаны иметь настроенный TOTP.
// GET/PUT /features пропускаем — иначе админ не сможет увидеть флаг и включить 2FA.
router.use(async (req, res, next) => {
  try {
    if (req.path === '/features') return next()
    const flagOn = await isFeatureEnabled('two_fa')
    if (!flagOn) return next()
    if (req.user?.role === 'admin' || req.user?.role === 'super_admin') {
      const totp = await prisma.user_totp.findUnique({ where: { user_id: req.user.userId } })
      if (!totp?.enabled) {
        return res.status(403).json({
          success: false,
          code: '2FA_REQUIRED',
          message: 'Two-factor authentication must be enabled for admin access',
        })
      }
    }
    next()
  } catch (err) {
    logger.error('require2FA middleware error:', err)
    next()
  }
})
router.use(auditLogMiddleware)

const ALLOWED_SETTINGS = [
  'TELEGRAM_BOT_TOKEN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'COMPANY_NAME', 'COMPANY_LOGO', 'TIMEZONE', 'DEFAULT_LANGUAGE',
  'AUTO_ASSIGN', 'SLA_RESPONSE_HOURS', 'SLA_ESCALATION_ENABLED', 'SLA_ESCALATION_HOURS',
  'LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_DN', 'LDAP_BIND_CREDENTIALS',
  'EMAIL_TEMPLATES',
  'IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASS',
  'SSO_ENABLED', 'SSO_ISSUER_URL', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET',
  'SSO_REDIRECT_URI', 'SSO_DEFAULT_ROLE', 'SSO_PROVIDER',
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

const EXPECTED_TEMPLATE_KEYS = [
  'ticketCreatedSubject', 'ticketCreatedBody',
  'ticketStatusSubject', 'ticketStatusBody',
  'ticketAssignedSubject', 'ticketAssignedBody',
  'slaBreachedSubject', 'slaBreachedBody',
]

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      if (!ALLOWED_SETTINGS.includes(key)) continue
      if (key === 'EMAIL_TEMPLATES') {
        try {
          const parsed = JSON.parse(String(value))
          const keys = Object.keys(parsed)
          const missing = EXPECTED_TEMPLATE_KEYS.filter(k => !keys.includes(k))
          if (missing.length > 0) {
            return res.status(400).json({ success: false, message: `EMAIL_TEMPLATES missing keys: ${missing.join(', ')}` })
          }
        } catch {
          return res.status(400).json({ success: false, message: 'EMAIL_TEMPLATES must be valid JSON' })
        }
      }
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

router.get('/imap/status', async (req, res) => {
  try {
    const { getEmailStats } = await import('../services/email-ingestion.service.js')
    const stats = await getEmailStats()
    res.json({ success: true, data: stats })
  } catch (err) {
    logger.error('IMAP status error:', err)
    res.status(500).json({ success: false, message: 'Failed to get IMAP status' })
  }
})

router.post('/imap/test', async (req, res) => {
  try {
    const { testImapConnection } = await import('../services/email-ingestion.service.js')
    const result = await testImapConnection()
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('IMAP test error:', err)
    res.status(400).json({ success: false, message: err.message })
  }
})

router.get('/users', async (req, res) => {
  try {
    const rows = await prisma.employees.findMany({
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    })
    const data = rows.map(r => ({
      id: r.id, name: r.name, email: r.email,
      role: r.role, department: r.department, title: r.title,
      avatar: r.avatar, phone: r.phone,
      online: r.online,
      activeTickets: r.active_tickets || 0,
      resolvedToday: r.resolved_today || 0,
      isActive: r.is_active,
      createdAt: r.created_at,
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
  if (role) {
    if (role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot assign super_admin via API' })
    }
    if (!['admin', 'senior_agent', 'agent', 'requester'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' })
    }
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
  const { entityType, entityId, limit = 50, offset = 0, from, to, format } = req.query
  try {
    const where = {}
    if (entityType) where.entity_type = entityType
    if (entityId) where.entity_id = Number(entityId)
    if (from || to) {
      where.created_at = {}
      if (from) where.created_at.gte = new Date(from)
      if (to) where.created_at.lte = new Date(to)
    }
    const rows = await prisma.audit_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: Number(offset),
      take: format === 'csv' ? undefined : Number(limit),
    })
    if (format === 'csv') {
      const header = 'Date,User,Action,Entity,EntityId,IP\n'
      const csv = rows.map(r =>
        `"${r.created_at}","${r.user_name || ''}","${r.action}","${r.entity_type || ''}","${r.entity_id || ''}","${r.ip_address || ''}"`
      ).join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename=audit.csv')
      return res.send('\uFEFF' + header + csv)
    }
    res.json({ success: true, data: rows })
  } catch (err) {
    logger.error('Audit log error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' })
  }
})

router.post('/settings/backup', async (req, res) => {
  try {
    const script = path.join(projectRoot, 'scripts', 'backup-mysql.ps1')
    exec(`"${process.env.ComSpec || 'cmd.exe'}" /c powershell -File "${script}"`, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        logger.error('Backup error:', err.message)
        return res.status(500).json({ success: false, message: stderr || err.message })
      }
      res.json({ success: true, data: { output: stdout.trim() } })
    })
  } catch (err) {
    logger.error('Backup route error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/settings/seed', async (req, res) => {
  try {
    const serverDir = path.join(projectRoot, 'server')
    exec('npm.cmd run seed', { cwd: serverDir, timeout: 120000, shell: process.env.ComSpec || 'cmd.exe' }, (err, stdout, stderr) => {
      if (err) {
        logger.error('Seed error:', err.message)
        return res.status(500).json({ success: false, message: stderr || err.message })
      }
      res.json({ success: true, data: { output: stdout.trim() } })
    })
  } catch (err) {
    logger.error('Seed route error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/settings/geo', async (_req, res) => {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE tickets ADD FULLTEXT INDEX ft_tickets_search (title, description)')
    res.json({ success: true, data: { message: 'Fulltext index created' } })
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME') {
      return res.json({ success: true, data: { message: 'Fulltext index already exists' } })
    }
    logger.error('Geo route error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/settings/redis-status', async (req, res) => {
  try {
    const row = await prisma.admin_settings.findUnique({ where: { key: 'REDIS_URL' } })
    const redisUrl = row?.value || ''
    let connected = false
    if (redisUrl) {
      try {
        const { createClient } = await import('redis')
        const client = createClient({ url: redisUrl })
        await client.connect()
        await client.ping()
        await client.quit()
        connected = true
      } catch { }
    }
    res.json({ success: true, data: { url: redisUrl, connected } })
  } catch (err) {
    logger.error('Redis status error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

router.put('/settings/redis', async (req, res) => {
  try {
    const { url } = req.body
    await prisma.admin_settings.upsert({
      where: { key: 'REDIS_URL' },
      update: { value: url || '', updated_at: new Date() },
      create: { key: 'REDIS_URL', value: url || '', updated_at: new Date() },
    })
    res.json({ success: true, data: { updated: true } })
  } catch (err) {
    logger.error('Redis settings error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

const ROLLOUT_DEFAULT = 100

const toRolloutPercent = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return ROLLOUT_DEFAULT
  return Math.min(100, Math.max(0, Math.round(n)))
}

const DEFAULT_FEATURES = [
  { key: 'new_ticket_form', enabled: true, description: 'Новая форма создания тикета', rollout_percent: ROLLOUT_DEFAULT, schedule: null },
  { key: 'kanban_view', enabled: true, description: 'Kanban-доска вместо списка', rollout_percent: ROLLOUT_DEFAULT, schedule: null },
  { key: 'dark_theme', enabled: true, description: 'Тёмная тема интерфейса', rollout_percent: ROLLOUT_DEFAULT, schedule: null },
]

const toFeaturePayload = (f) => ({
  key: f.key,
  enabled: Boolean(f.enabled),
  description: f.description || '',
  rollout_percent: toRolloutPercent(f.rollout_percent),
})

const toSchedule = (value) => {
  if (!value || typeof value !== 'object') return null
  const cleanFrom = typeof value.from === 'string' ? value.from.trim() : ''
  const cleanTo = typeof value.to === 'string' ? value.to.trim() : ''
  if (!cleanFrom && !cleanTo) return null
  return { from: cleanFrom || '', to: cleanTo || '' }
}

async function getSchedules() {
  try {
    const settings = await getSettings()
    const raw = settings.FEATURE_SCHEDULES
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveSchedules(schedules) {
  await prisma.admin_settings.upsert({
    where: { key: 'FEATURE_SCHEDULES' },
    update: { value: JSON.stringify(schedules), updated_at: new Date() },
    create: { key: 'FEATURE_SCHEDULES', value: JSON.stringify(schedules), updated_at: new Date() },
  })
  invalidateSettingsCache()
}

router.post('/sla/run-check', async (req, res) => {
  try {
    const { runSlaCheck } = await import('../background.js')
    await runSlaCheck(prisma)
    res.json({ success: true, data: { ran: true } })
  } catch (err) {
    logger.error('SLA run-check error:', err)
    res.status(500).json({ success: false, message: 'Failed to run SLA check' })
  }
})

router.get('/features', cacheMiddleware(30), async (req, res) => {
  try {
    const rows = await prisma.feature_flags.findMany({ orderBy: { key: 'asc' } })
    if (rows.length === 0) {
      return res.json({ success: true, data: DEFAULT_FEATURES })
    }
    const schedules = await getSchedules()
    res.json({
      success: true,
      data: rows.map((r) => ({
        key: r.key,
        enabled: r.enabled,
        description: r.description,
        rollout_percent: r.rollout_percent ?? ROLLOUT_DEFAULT,
        schedule: toSchedule(schedules[r.key]) || null,
      })),
    })
  } catch (err) {
    logger.error('Features get error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch features' })
  }
})

router.put('/features', async (req, res) => {
  try {
    const flags = req.body
    if (!Array.isArray(flags)) {
      return res.status(400).json({ success: false, message: 'Expected array of { key, enabled }' })
    }
    const schedules = await getSchedules()
    for (const f of flags) {
      const payload = toFeaturePayload(f)
      await prisma.feature_flags.upsert({
        where: { key: f.key },
        update: { ...payload, updated_at: new Date() },
        create: { ...payload, updated_at: new Date() },
      })
      if (f.schedule !== undefined) {
        const s = toSchedule(f.schedule)
        if (s) schedules[f.key] = s
        else delete schedules[f.key]
      }
    }
    await saveSchedules(schedules)
    await invalidateCache('cache:*')
    invalidateFeatureFlagCache()
    res.json({ success: true, data: { updated: true } })
  } catch (err) {
    logger.error('Features update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update features' })
  }
})

const TRANSLIT_MAP = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',
  о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',
  ь:'',э:'e',ю:'yu',я:'ya',
  А:'A',Б:'B',В:'V',Г:'G',Д:'D',Е:'E',Ё:'Yo',Ж:'Zh',З:'Z',И:'I',Й:'Y',К:'K',Л:'L',М:'M',Н:'N',
  О:'O',П:'P',Р:'R',С:'S',Т:'T',У:'U',Ф:'F',Х:'Kh',Ц:'Ts',Ч:'Ch',Ш:'Sh',Щ:'Shch',Ъ:'',Ы:'Y',
  Ь:'',Э:'E',Ю:'Yu',Я:'Ya',
}

function transliterate(str) {
  return str.split('').map(ch => TRANSLIT_MAP[ch] ?? ch).join('')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '')
}

function parseImportRows(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []
  const rows = []
  for (const line of lines) {
    const cells = line.split(/\t/).map(c => c.trim())
    if (cells.length < 3) {
      const cells2 = line.split(/\s{2,}/).map(c => c.trim())
      if (cells2.length >= 3) {
        rows.push({
          department: cells2[0] || '',
          name: cells2[1] || '',
          title: cells2[2] || '',
          phone: cells2[3] || '',
        })
        continue
      }
      continue
    }
    rows.push({
      department: cells[0] || '',
      name: cells[1] || '',
      title: cells[2] || '',
      phone: cells[3] || '',
    })
  }
  return rows
}

router.post('/employees/import', async (req, res) => {
  try {
    const { rows: rawRows, text, defaultPassword = '123456', domain = 'company.local' } = req.body
    const parsed = rawRows?.length ? rawRows : parseImportRows(text || '')
    if (!parsed.length) {
      return res.status(400).json({ success: false, message: 'Нет данных для импорта. Вставьте таблицу из Word (отдел \\t ФИО \\t должность \\t телефон)' })
    }
    const existing = await prisma.employees.findMany({ select: { email: true } })
    const existingEmails = new Set(existing.map(e => e.email))
    const hash = await bcrypt.hash(defaultPassword, 12)
    const created = []
    const skipped = []
    const emailCounters = {}
    for (const row of parsed) {
      if (!row.name) { skipped.push({ ...row, reason: 'Пустое ФИО' }); continue }
      const baseEmail = transliterate(row.name) + '@' + domain
      let email = baseEmail
      if (emailCounters[baseEmail]) {
        emailCounters[baseEmail]++
        email = baseEmail.replace('@', `.${emailCounters[baseEmail]}@`)
      } else {
        emailCounters[baseEmail] = 1
      }
      if (existingEmails.has(email)) {
        skipped.push({ ...row, email, reason: 'Email уже существует' })
        continue
      }
      try {
        const emp = await prisma.employees.create({
          data: {
            name: row.name,
            email,
            password_hash: hash,
            role: 'agent',
            department: row.department || '',
            title: row.title || 'Сотрудник',
            phone: row.phone || '',
            is_active: true,
          },
        })
        created.push({ id: emp.id, name: emp.name, email: emp.email, department: emp.department, title: emp.title, phone: emp.phone })
        existingEmails.add(email)
      } catch (err) {
        skipped.push({ ...row, email, reason: err.message })
      }
    }
    res.json({ success: true, data: { created: created.length, skipped: skipped.length, employees: created, errors: skipped, defaultPassword } })
  } catch (err) {
    logger.error('Employees import error:', err)
    res.status(500).json({ success: false, message: 'Ошибка импорта сотрудников' })
  }
})

router.get('/custom-fields', async (req, res) => {
  try {
    const { listAllFieldDefinitions } = await import('../services/custom-fields.service.js')
    const data = await listAllFieldDefinitions()
    res.json({ success: true, data })
  } catch (err) {
    logger.error('Custom fields list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch custom fields' })
  }
})

router.post('/custom-fields', async (req, res) => {
  try {
    const { createFieldDefinition } = await import('../services/custom-fields.service.js')
    const { name, type, options, required, category, sortOrder } = req.body
    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'name and type are required' })
    }
    const field = await createFieldDefinition({ name, type, options, required, category, sortOrder })
    res.status(201).json({ success: true, data: field })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message })
    logger.error('Custom field create error:', err)
    res.status(500).json({ success: false, message: 'Failed to create custom field' })
  }
})

router.put('/custom-fields/:id', async (req, res) => {
  try {
    const { updateFieldDefinition } = await import('../services/custom-fields.service.js')
    const field = await updateFieldDefinition(Number(req.params.id), req.body)
    if (!field) return res.status(404).json({ success: false, message: 'Field not found' })
    res.json({ success: true, data: field })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message })
    logger.error('Custom field update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update custom field' })
  }
})

router.delete('/custom-fields/:id', async (req, res) => {
  try {
    const { deleteFieldDefinition } = await import('../services/custom-fields.service.js')
    const deleted = await deleteFieldDefinition(Number(req.params.id))
    if (!deleted) return res.status(404).json({ success: false, message: 'Field not found' })
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    logger.error('Custom field delete error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete custom field' })
  }
})

router.get('/csat/stats', async (req, res) => {
  try {
    const { getCsatStats } = await import('../services/csat.service.js')
    const data = await getCsatStats()
    res.json({ success: true, data })
  } catch (err) {
    logger.error('CSAT stats error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch CSAT stats' })
  }
})

router.get('/csat/recent', async (req, res) => {
  try {
    const { getRecentSurveys } = await import('../services/csat.service.js')
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
    const data = await getRecentSurveys(limit)
    res.json({ success: true, data })
  } catch (err) {
    logger.error('CSAT recent error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch recent surveys' })
  }
})

// ── Этап 58: диагностика, RBAC, сессии, восстановление ──

const toPosInt = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

router.get('/health', async (req, res) => {
  try {
    const [db, redis, meili, smtp, imap, queue] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkMeili(),
      checkSmtp(),
      checkImap(),
      getQueueStats(),
    ])
    res.json({
      success: true,
      data: { checks: [db, redis, meili, smtp, imap], queue, updatedAt: new Date().toISOString() },
    })
  } catch (err) {
    logger.error('Health check error:', err)
    res.status(500).json({ success: false, message: 'Failed to run health checks' })
  }
})

router.get('/queues', async (req, res) => {
  try {
    res.json({ success: true, data: await getQueueStats() })
  } catch (err) {
    logger.error('Queue stats error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch queue stats' })
  }
})

router.get('/migrations', async (req, res) => {
  try {
    res.json({ success: true, data: await getMigrations() })
  } catch (err) {
    logger.error('Migrations status error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch migrations' })
  }
})

router.post('/search/reindex', async (req, res) => {
  try {
    const result = await reindexSearch()
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('Reindex error:', err)
    res.status(500).json({ success: false, message: 'Failed to reindex search' })
  }
})

router.get('/rbac', async (req, res) => {
  try {
    res.json({ success: true, data: getRbacMatrix() })
  } catch (err) {
    logger.error('RBAC matrix error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch RBAC matrix' })
  }
})

router.post('/sessions/revoke-all', async (req, res) => {
  try {
    const { count } = await prisma.refresh_tokens.deleteMany({})
    res.json({ success: true, data: { revoked: count } })
  } catch (err) {
    logger.error('Revoke all sessions error:', err)
    res.status(500).json({ success: false, message: 'Failed to revoke sessions' })
  }
})

router.post('/sessions/revoke/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user id' })
    }
    const { count } = await prisma.refresh_tokens.deleteMany({ where: { user_id: userId } })
    res.json({ success: true, data: { revoked: count } })
  } catch (err) {
    logger.error('Revoke user sessions error:', err)
    res.status(500).json({ success: false, message: 'Failed to revoke sessions' })
  }
})

router.post('/settings/restore', async (req, res) => {
  try {
    const { content } = req.body || {}
    const result = await restoreBackup(content)
    if (!result.ok) return res.status(400).json({ success: false, message: result.message })
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('Restore error:', err)
    res.status(500).json({ success: false, message: 'Failed to restore backup' })
  }
})

router.get('/email/preview', async (req, res) => {
  try {
    const { template } = req.query
    if (!template) return res.status(400).json({ success: false, message: 'template is required' })
    const preview = await getEmailTemplatePreview(String(template))
    if (!preview) return res.status(404).json({ success: false, message: 'Template not found' })
    res.json({ success: true, data: preview })
  } catch (err) {
    logger.error('Email preview error:', err)
    res.status(500).json({ success: false, message: 'Failed to render preview' })
  }
})

router.put('/settings/rate-limits', async (req, res) => {
  try {
    const { auth, api, admin } = req.body || {}
    const payload = { auth: toPosInt(auth), api: toPosInt(api), admin: toPosInt(admin) }
    await prisma.admin_settings.upsert({
      where: { key: 'RATE_LIMITS' },
      update: { value: JSON.stringify(payload), updated_at: new Date() },
      create: { key: 'RATE_LIMITS', value: JSON.stringify(payload), updated_at: new Date() },
    })
    setRateLimitOverrides(payload)
    invalidateSettingsCache()
    res.json({ success: true, data: payload })
  } catch (err) {
    logger.error('Rate limits update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update rate limits' })
  }
})

export default router
