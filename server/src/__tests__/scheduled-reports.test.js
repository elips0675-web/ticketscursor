import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateFeatureFlagCache } from '../feature-flags.js'
import {
  isValidCron,
  normalizeRecipients,
  formatReportText,
  buildReportData,
  processScheduledReports,
} from '../services/scheduled-reports.service.js'

// Этап 66 (подфича 4) — Scheduled reports (флаг scheduled_reports):
//  - admin CRUD /api/admin/scheduled-reports (GET/POST/PUT/DELETE/run, 400/404, 404 при флаге off);
//  - cron-валидация + нормализация получателей;
//  - processScheduledReports: доставка по next_run_at + пересчёт next_run_at;
//  - изоляция: выделенные id 614 (admin) / 615 (agent).
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')

const adminToken = jwt.sign({ userId: 614, role: 'admin', name: 'Reports Admin' }, JWT_SECRET, { expiresIn: '1h' })
const agentToken = jwt.sign({ userId: 615, role: 'agent', name: 'Reports Agent' }, JWT_SECRET, { expiresIn: '1h' })

const createdReportIds = []

async function setFlag(enabled) {
  await prisma.feature_flags.update({ where: { key: 'scheduled_reports' }, data: { enabled } })
  invalidateFeatureFlagCache()
}

async function cleanupEmployeeDeps(id) {
  await prisma.notifications.deleteMany({ where: { user_id: id } })
  await prisma.audit_log.deleteMany({ where: { user_id: id } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: id } })
  await prisma.notification_preferences.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.user_totp.deleteMany({ where: { user_id: id } }).catch(() => {})
}

async function seedEmployee(id, email, role, name) {
  await cleanupEmployeeDeps(id)
  await prisma.employees.deleteMany({ where: { id } })
  await prisma.employees.create({ data: { id, name, email, password_hash: PASSWORD_HASH, role, is_active: true } })
}

async function createReport(payload) {
  const res = await request(app)
    .post('/api/admin/scheduled-reports')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload)
  if (res.body.data?.id) createdReportIds.push(res.body.data.id)
  return res
}

beforeAll(async () => {
  await seedEmployee(614, 'reports-admin@example.com', 'admin', 'Reports Admin')
  await seedEmployee(615, 'reports-agent@example.com', 'agent', 'Reports Agent')
  await setFlag(true)
})

afterAll(async () => {
  if (createdReportIds.length) {
    await prisma.scheduled_reports.deleteMany({ where: { id: { in: createdReportIds } } })
  }
  await setFlag(false)
  await prisma.audit_log.deleteMany({ where: { user_id: { in: [614, 615] } } })
  await prisma.notifications.deleteMany({ where: { user_id: { in: [614, 615] } } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: [614, 615] } } })
  await prisma.employees.deleteMany({ where: { id: { in: [614, 615] } } })
})

describe('scheduled-reports — чистые функции', () => {
  it('isValidCron принимает валидное и отвергает мусор', () => {
    expect(isValidCron('0 9 * * 1-5')).toBe(true)
    expect(isValidCron('not-a-cron')).toBe(false)
  })

  it('normalizeRecipients фильтрует невалидные, убирает дубли, обрезает пробелы', () => {
    expect(normalizeRecipients([' a@b.ru ', 'a@b.ru', 'bad', '', 42, 'c@d.io'])).toEqual(['a@b.ru', 'c@d.io'])
    expect(normalizeRecipients('nope')).toEqual([])
  })

  it('formatReportText содержит название и метрики', () => {
    const text = formatReportText(
      { name: 'Сводка', report_type: 'tickets_summary' },
      { total: 10, open: 2, in_progress: 3, resolved: 4, closed: 1, overdue: 1, by_priority: { high: 2 } },
    )
    expect(text).toContain('Сводка')
    expect(text).toContain('Всего тикетов: 10')
    expect(text).toContain('high: 2')
  })

  it('buildReportData tickets_summary возвращает числовые счётчики', async () => {
    const data = await buildReportData('tickets_summary')
    expect(typeof data.total).toBe('number')
    expect(data.by_priority).toBeTypeOf('object')
  })
})

describe('Admin CRUD /api/admin/scheduled-reports', () => {
  it('401 без токена', async () => {
    await request(app).get('/api/admin/scheduled-reports').expect(401)
    await request(app).post('/api/admin/scheduled-reports').send({ name: 'x' }).expect(401)
  })

  it('404 когда флаг выключен', async () => {
    await setFlag(false)
    await request(app).get('/api/admin/scheduled-reports').set('Authorization', `Bearer ${adminToken}`).expect(404)
    await setFlag(true)
  })

  it('POST: пустое имя → 400; нет получателей → 400; невалидный cron → 400', async () => {
    const noName = await createReport({ name: '  ', recipients: ['a@b.ru'], cronExpr: '0 9 * * *' })
    expect(noName.status).toBe(400)

    const noRecipients = await createReport({ name: 'X', recipients: ['bad'], cronExpr: '0 9 * * *' })
    expect(noRecipients.status).toBe(400)

    const badCron = await createReport({ name: 'X', recipients: ['a@b.ru'], cronExpr: 'not-a-cron' })
    expect(badCron.status).toBe(400)
  })

  it('POST: создаёт отчёт, нормализует тип/получателей и считает next_run_at', async () => {
    const res = await createReport({
      name: 'Ежедневная сводка',
      reportType: 'bogus',
      recipients: ['ops@b.ru', 'ops@b.ru', 'bad'],
      cronExpr: '0 9 * * 1-5',
      enabled: true,
    })
    expect(res.status).toBe(201)
    expect(res.body.data.report_type).toBe('tickets_summary')
    expect(res.body.data.recipients).toEqual(['ops@b.ru'])
    expect(res.body.data.next_run_at).toBeTruthy()
  })

  it('GET: список содержит созданный отчёт; agent получает 403', async () => {
    const list = await request(app)
      .get('/api/admin/scheduled-reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(Array.isArray(list.body.data)).toBe(true)
    expect(list.body.data.some((r) => r.name === 'Ежедневная сводка')).toBe(true)

    await request(app)
      .get('/api/admin/scheduled-reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403)
  })

  it('PUT: обновляет, сбрасывает next_run_at при выключении, 400 на cron, 404 на id', async () => {
    const created = await createReport({
      name: 'PUT target',
      reportType: 'sla_summary',
      recipients: ['a@b.ru'],
      cronExpr: '0 9 * * *',
      enabled: true,
    })
    const id = created.body.data.id

    const before = await request(app)
      .get('/api/admin/scheduled-reports')
      .set('Authorization', `Bearer ${adminToken}`)
    const originalNextRun = before.body.data.find((r) => r.id === id).next_run_at
    expect(originalNextRun).toBeTruthy()

    const off = await request(app)
      .put(`/api/admin/scheduled-reports/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false })
    expect(off.status).toBe(200)
    expect(off.body.data.next_run_at).toBeNull()

    const badCron = await request(app)
      .put(`/api/admin/scheduled-reports/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cronExpr: 'bad' })
    expect(badCron.status).toBe(400)

    await request(app)
      .put('/api/admin/scheduled-reports/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x' })
      .expect(404)
  })

  it('POST /:id/run отправляет отчёт и обновляет last_run_at', async () => {
    const created = await createReport({
      name: 'Run now',
      reportType: 'csat_summary',
      recipients: ['a@b.ru', 'c@d.ru'],
      cronExpr: '0 12 * * *',
      enabled: true,
    })
    const id = created.body.data.id

    const run = await request(app)
      .post(`/api/admin/scheduled-reports/${id}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(run.status).toBe(200)
    expect(run.body.data.recipients).toBe(2)

    const row = await prisma.scheduled_reports.findUnique({ where: { id } })
    expect(row.last_run_at).toBeTruthy()

    await request(app)
      .post('/api/admin/scheduled-reports/999999/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)
  })

  it('DELETE удаляет отчёт; повторное удаление → 404', async () => {
    const created = await createReport({
      name: 'To delete',
      recipients: ['a@b.ru'],
      cronExpr: '0 9 * * *',
      enabled: false,
    })
    const id = created.body.data.id

    await request(app)
      .delete(`/api/admin/scheduled-reports/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    await request(app)
      .delete(`/api/admin/scheduled-reports/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)
  })
})

describe('processScheduledReports', () => {
  it('обрабатывает просроченный отчёт и пересчитывает next_run_at', async () => {
    const created = await createReport({
      name: 'Due now',
      reportType: 'tickets_summary',
      recipients: ['due@b.ru'],
      cronExpr: '0 9 * * *',
      enabled: true,
    })
    const id = created.body.data.id
    await prisma.scheduled_reports.update({ where: { id }, data: { next_run_at: new Date(Date.now() - 60_000) } })

    const sent = await processScheduledReports()
    expect(sent).toBeGreaterThanOrEqual(1)

    const row = await prisma.scheduled_reports.findUnique({ where: { id } })
    expect(row.last_run_at).toBeTruthy()
    expect(new Date(row.next_run_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('возвращает 0 при выключенном флаге', async () => {
    await setFlag(false)
    expect(await processScheduledReports()).toBe(0)
    await setFlag(true)
  })
})
