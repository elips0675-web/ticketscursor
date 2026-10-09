// Этап 66 (подфича 4): Scheduled reports — cron-расписание + email-доставка сводок.
// Типы отчётов: tickets_summary / sla_summary / csat_summary.
import { CronExpressionParser } from 'cron-parser'
import prisma from '../prisma.js'
import logger from '../logger.js'
import { sendTicketNotification } from '../email.js'
import { isFeatureEnabled } from '../feature-flags.js'

export const REPORT_TYPES = ['tickets_summary', 'sla_summary', 'csat_summary']
const DEFAULT_CRON = '0 9 * * 1-5'
const MAX_RECIPIENTS = 50
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidCron(expr) {
  try {
    CronExpressionParser.parse(String(expr))
    return true
  } catch {
    return false
  }
}

export function nextRunAt(cronExpr) {
  try {
    return CronExpressionParser.parse(String(cronExpr)).next().toDate()
  } catch {
    return null
  }
}

export function normalizeRecipients(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const email = typeof item === 'string' ? item.trim() : ''
    if (email && EMAIL_RE.test(email) && !out.includes(email)) out.push(email)
  }
  return out.slice(0, MAX_RECIPIENTS)
}

export async function listReports() {
  return prisma.scheduled_reports.findMany({ orderBy: { created_at: 'desc' } })
}

export async function getReport(id) {
  if (!Number.isFinite(Number(id))) return null
  return prisma.scheduled_reports.findUnique({ where: { id: Number(id) } })
}

export async function createReport({ name, reportType, recipients, cronExpr, enabled, createdBy }) {
  const cron = (cronExpr && String(cronExpr).trim()) || DEFAULT_CRON
  const type = REPORT_TYPES.includes(reportType) ? reportType : REPORT_TYPES[0]
  const isOn = Boolean(enabled)
  return prisma.scheduled_reports.create({
    data: {
      name: String(name).trim(),
      report_type: type,
      recipients: normalizeRecipients(recipients),
      cron_expr: cron,
      enabled: isOn,
      next_run_at: isOn ? nextRunAt(cron) : null,
      created_by: createdBy || null,
    },
  })
}

export async function updateReport(id, data) {
  const existing = await getReport(id)
  if (!existing) return null

  const update = { updated_at: new Date() }
  if (data.name !== undefined) update.name = String(data.name).trim()
  if (data.reportType !== undefined && REPORT_TYPES.includes(data.reportType)) update.report_type = data.reportType
  if (data.recipients !== undefined) update.recipients = normalizeRecipients(data.recipients)
  if (data.cronExpr !== undefined) update.cron_expr = String(data.cronExpr).trim()
  if (data.enabled !== undefined) update.enabled = Boolean(data.enabled)

  if (data.cronExpr !== undefined || data.enabled !== undefined) {
    const cron = update.cron_expr ?? existing.cron_expr
    const isOn = update.enabled ?? existing.enabled
    update.next_run_at = isOn ? nextRunAt(cron) : null
  }

  return prisma.scheduled_reports.update({ where: { id: Number(id) }, data: update })
}

export async function deleteReport(id) {
  const existing = await getReport(id)
  if (!existing) return null
  await prisma.scheduled_reports.delete({ where: { id: Number(id) } })
  return true
}

async function buildTicketsSummary() {
  const where = { deleted_at: null }
  const [total, open, inProgress, resolved, closed, overdue, byPriority] = await Promise.all([
    prisma.tickets.count({ where }),
    prisma.tickets.count({ where: { ...where, status: 'open' } }),
    prisma.tickets.count({ where: { ...where, status: 'in_progress' } }),
    prisma.tickets.count({ where: { ...where, status: 'resolved' } }),
    prisma.tickets.count({ where: { ...where, status: 'closed' } }),
    prisma.tickets.count({ where: { ...where, status: { in: ['open', 'in_progress'] }, due_at: { lt: new Date() } } }),
    prisma.tickets.groupBy({ by: ['priority'], where, _count: { _all: true } }),
  ])
  const priority = {}
  for (const row of byPriority) priority[row.priority || 'unknown'] = row._count._all
  return { total, open, in_progress: inProgress, resolved, closed, overdue, by_priority: priority }
}

async function buildSlaSummary() {
  const [row] = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN due_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 ELSE 0 END) AS on_time,
      SUM(CASE WHEN due_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 ELSE 0 END) AS late
    FROM tickets
    WHERE deleted_at IS NULL AND resolved_at IS NOT NULL AND due_at IS NOT NULL
  `
  const total = Number(row?.total || 0)
  const onTime = Number(row?.on_time || 0)
  const late = Number(row?.late || 0)
  const openOverdue = await prisma.tickets.count({
    where: { deleted_at: null, status: { in: ['open', 'in_progress'] }, due_at: { lt: new Date() } },
  })
  return {
    resolved_with_sla: total,
    on_time: onTime,
    breached: late,
    open_overdue: openOverdue,
    compliance: total ? Math.round((onTime / total) * 100) : 0,
  }
}

async function buildCsatSummary() {
  const [sent, responded, ratings] = await Promise.all([
    prisma.csat_surveys.count(),
    prisma.csat_surveys.count({ where: { responded_at: { not: null } } }),
    prisma.csat_surveys.findMany({ where: { rating: { not: null } }, select: { rating: true } }),
  ])
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const r of ratings) {
    if (distribution[r.rating] !== undefined) distribution[r.rating]++
    sum += r.rating
  }
  return {
    sent,
    responded,
    response_rate: sent ? Math.round((responded / sent) * 100) : 0,
    average: ratings.length ? Number((sum / ratings.length).toFixed(2)) : 0,
    distribution,
  }
}

export async function buildReportData(reportType) {
  if (reportType === 'sla_summary') return buildSlaSummary()
  if (reportType === 'csat_summary') return buildCsatSummary()
  return buildTicketsSummary()
}

export function formatReportText(report, data) {
  const lines = [`Отчёт «${report.name}» (${report.report_type})`, `Дата: ${new Date().toLocaleString('ru-RU')}`, '']
  if (report.report_type === 'tickets_summary') {
    lines.push(`Всего тикетов: ${data.total}`)
    lines.push(`Открытых: ${data.open}`, `В работе: ${data.in_progress}`)
    lines.push(`Решённых: ${data.resolved}`, `Закрытых: ${data.closed}`, `Просрочено (SLA): ${data.overdue}`)
    lines.push('', 'По приоритетам:')
    for (const [p, c] of Object.entries(data.by_priority)) lines.push(`  ${p}: ${c}`)
  } else if (report.report_type === 'sla_summary') {
    lines.push(`Решено с учётом SLA: ${data.resolved_with_sla}`)
    lines.push(`Решено в срок: ${data.on_time}`, `Нарушено: ${data.breached}`)
    lines.push(`Соблюдение: ${data.compliance}%`, `Открытых просрочено: ${data.open_overdue}`)
  } else {
    lines.push(`Отправлено опросов: ${data.sent}`, `Ответов: ${data.responded}`)
    lines.push(`Доля ответов: ${data.response_rate}%`, `Средняя оценка: ${data.average}`)
    lines.push('', 'Распределение оценок:')
    for (const [r, c] of Object.entries(data.distribution)) lines.push(`  ${r}: ${c}`)
  }
  return lines.join('\n')
}

export async function runReport(report) {
  const data = await buildReportData(report.report_type)
  const text = formatReportText(report, data)
  const recipients = normalizeRecipients(report.recipients)
  for (const to of recipients) {
    await sendTicketNotification({ to, subject: `[Отчёт] ${report.name}`, text })
  }
  await prisma.scheduled_reports.update({
    where: { id: report.id },
    data: { last_run_at: new Date(), next_run_at: nextRunAt(report.cron_expr) },
  })
  return { recipients: recipients.length, reportType: report.report_type }
}

export async function processScheduledReports() {
  if (!(await isFeatureEnabled('scheduled_reports'))) return 0
  const due = await prisma.scheduled_reports.findMany({
    where: { enabled: true, next_run_at: { lte: new Date() } },
    take: 100,
  })
  let sent = 0
  for (const report of due) {
    try {
      await runReport(report)
      sent++
    } catch (err) {
      logger.error(`Scheduled report #${report.id} failed: ${err.message}`)
      await prisma.scheduled_reports
        .update({ where: { id: report.id }, data: { next_run_at: nextRunAt(report.cron_expr) } })
        .catch(() => {})
    }
  }
  if (sent > 0) logger.info(`Scheduled reports sent: ${sent}`)
  return sent
}
