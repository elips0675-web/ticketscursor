import logger from './logger.js'
import { sendTicketNotification } from './email.js'
import { notifySlaBreached, notifySlaEscalated } from './notify.js'
import { getSettings } from './settings.js'
import { startImapPolling, stopImapPolling } from './services/email-ingestion.service.js'
import { processRecurrences } from './services/recurrence.service.js'

const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000
const SLA_CHECK_INTERVAL = 15 * 60 * 1000
const RECURRENCE_INTERVAL = 60 * 60 * 1000
const MAX_RETRIES = 3
const DLQ_ALERT_THRESHOLD = 10

async function withRetry(fn, name, prisma) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await fn(prisma)
      return
    } catch (err) {
      logger.error(`${name} failed (attempt ${attempt}/${MAX_RETRIES}):`, err.message)
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500
        await new Promise(r => setTimeout(r, delay))
      } else {
        logger.error(`${name} exhausted all retries — moved to DLQ`, { error: err.message })
        await dlqRecord(name, err.message, attempt)
      }
    }
  }
}

async function dlqRecord(taskName, error, attempts) {
  try {
    const prisma = (await import('./prisma.js')).default
    const { default: knexLib } = await import('knex')
    const knexConfig = (await import('../knexfile.js')).default
    const knex = knexLib(knexConfig)
    await knex('event_outbox').insert({
      event_type: 'dlq:' + taskName,
      room: null,
      payload: JSON.stringify({ task: taskName, error, attempts, timestamp: new Date().toISOString() }),
    })
    await knex.destroy()
  } catch (e) {
    logger.error('DLQ record failed:', e.message)
  }
}

async function checkDlqAlert(prisma) {
  try {
    const count = await prisma.event_outbox.count({
      where: {
        event_type: { startsWith: 'dlq:' },
        sent_at: null,
      },
    })
    if (count > DLQ_ALERT_THRESHOLD) {
      logger.warn(`DLQ threshold exceeded: ${count} items (limit ${DLQ_ALERT_THRESHOLD})`)
      const admins = await prisma.employees.findMany({
        where: { is_active: true, role: { in: ['super_admin', 'admin'] } },
        select: { email: true },
      })
      for (const a of admins) {
        if (a.email) {
          sendTicketNotification({
            to: a.email,
            subject: `DLQ alert: ${count} failed background jobs`,
            text: `${count} background jobs in Dead Letter Queue. Threshold: ${DLQ_ALERT_THRESHOLD}. Check server logs.`,
          }).catch(() => {})
        }
      }
    }
  } catch (e) {
    logger.error('DLQ alert check failed:', e.message)
  }
}

async function warnAdminRedisMissing(prisma) {
  try {
    const admins = await prisma.employees.findMany({
      where: { is_active: true, role: { in: ['super_admin', 'admin'] } },
      select: { email: true },
    })
    for (const a of admins) {
      if (a.email) {
        sendTicketNotification({
          to: a.email,
          subject: 'Redis недоступен — фоновые задачи в unsafe-режиме',
          text: 'Redis не настроен (REDIS_URL не задан). Фоновые задачи (очистка уведомлений, проверка SLA) работают через setInterval без гарантий доставки и масштабирования. Настройте Redis для production.',
        }).catch(() => {})
      }
    }
  } catch (e) {
    logger.error('Failed to send Redis warning email:', e.message)
  }
}

let cleanupTimer, slaTimer, dlqAlertTimer, recurrenceTimer

export function stopBackgroundJobs() {
  if (cleanupTimer) clearInterval(cleanupTimer)
  if (slaTimer) clearInterval(slaTimer)
  if (dlqAlertTimer) clearInterval(dlqAlertTimer)
  if (recurrenceTimer) clearInterval(recurrenceTimer)
  stopImapPolling()
}

export async function setupBackgroundJobs(prisma) {
  if (process.env.REDIS_URL) {
    const { Queue, Worker, QueueScheduler } = await import('bullmq')
    const Redis = (await import('ioredis')).default

    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    const dlq = new Queue('service-desk-dlq', { connection })

    const cleanupQueue = new Queue('notification-cleanup', {
      connection,
      defaultJobOptions: {
        attempts: MAX_RETRIES,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    })
    const slaQueue = new Queue('sla-overdue-check', {
      connection,
      defaultJobOptions: {
        attempts: MAX_RETRIES,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    })

    new Worker('notification-cleanup', async () => {
      return runCleanup(prisma)
    }, {
      connection,
      concurrency: 1,
    })

    new Worker('sla-overdue-check', async () => {
      return runSlaCheck(prisma)
    }, {
      connection,
      concurrency: 1,
    })

    await cleanupQueue.upsertJobScheduler('default', { every: CLEANUP_INTERVAL })
    await slaQueue.upsertJobScheduler('default', { every: SLA_CHECK_INTERVAL })

    const recurrenceQueue = new Queue('recurrence-check', {
      connection,
      defaultJobOptions: {
        attempts: MAX_RETRIES,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    })
    new Worker('recurrence-check', async () => {
      return processRecurrences()
    }, { connection, concurrency: 1 })
    await recurrenceQueue.upsertJobScheduler('default', { every: RECURRENCE_INTERVAL })

    new Worker('service-desk-dlq', async (job) => {
      logger.error('DLQ job received:', { jobId: job.id, data: job.data })
      dlqAlertTimer = setInterval(() => checkDlqAlert(prisma), 60 * 60 * 1000)
      checkDlqAlert(prisma)
    }, { connection })

    runCleanup(prisma)
    runSlaCheck(prisma)

    logger.info('Background jobs using BullMQ (Redis) with retry + DLQ')
  } else {
    setTimeout(() => withRetry(runCleanup, 'notification-cleanup', prisma), 5000)
    setTimeout(() => withRetry(runSlaCheck, 'sla-overdue-check', prisma), 5000)
    setTimeout(() => withRetry(() => processRecurrences(), 'recurrence-check', prisma), 10000)
    setTimeout(() => withRetry(async () => checkDlqAlert(prisma), 'dlq-check', prisma), 30000)
    cleanupTimer = setInterval(() => withRetry(runCleanup, 'notification-cleanup', prisma), CLEANUP_INTERVAL)
    slaTimer = setInterval(() => withRetry(runSlaCheck, 'sla-overdue-check', prisma), SLA_CHECK_INTERVAL)
    recurrenceTimer = setInterval(() => withRetry(() => processRecurrences(), 'recurrence-check', prisma), RECURRENCE_INTERVAL)
    dlqAlertTimer = setInterval(() => withRetry(async () => checkDlqAlert(prisma), 'dlq-check', prisma), 60 * 60 * 1000)
    logger.warn('Redis not configured — background jobs using setInterval with in-memory retry + DLQ')
    warnAdminRedisMissing(prisma)
  }
  startImapPolling()
}

async function runCleanup(prisma) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const r = await prisma.notifications.deleteMany({
    where: { created_at: { lt: cutoff } },
  })
  if (r.count > 0) logger.info(`Cleaned ${r.count} old notifications`)
}

const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical']

export async function runSlaCheck(prisma) {
  const overdue = await prisma.tickets.findMany({
    where: {
      status: { in: ['open', 'in_progress'] },
      due_at: { lt: new Date() },
      deleted_at: null,
      sla_paused_at: null,
    },
    select: { id: true, priority: true, due_at: true, escalation_level: true, escalated_at: true },
    take: 200,
  })
  const settings = await getSettings()
  const escalationEnabled = settings.SLA_ESCALATION_ENABLED !== 'false'
  const escalationHours = Number(settings.SLA_ESCALATION_HOURS) || Number(settings.SLA_RESPONSE_HOURS) || 4

  for (const t of overdue) {
    await notifySlaBreached(t.id)
    if (!escalationEnabled) continue

    const currentLevel = t.escalation_level || 0
    const hoursOverdue = (Date.now() - new Date(t.due_at).getTime()) / (1000 * 60 * 60)
    const nextLevel = currentLevel + 1

    if (hoursOverdue >= escalationHours * nextLevel) {
      const idx = PRIORITY_ORDER.indexOf(t.priority || 'medium')
      if (idx < PRIORITY_ORDER.length - 1) {
        const newPriority = PRIORITY_ORDER[idx + 1]
        await prisma.tickets.update({
          where: { id: t.id },
          data: { priority: newPriority, escalation_level: nextLevel, escalated_at: new Date(), updated_at: new Date() },
        })
        await notifySlaEscalated(t.id, t.priority || 'medium', newPriority, nextLevel)
        logger.info(`SLA escalation #${t.id}: ${t.priority} → ${newPriority} (level ${nextLevel})`)
      } else {
        await prisma.tickets.update({
          where: { id: t.id },
          data: { escalation_level: nextLevel, escalated_at: new Date(), updated_at: new Date() },
        })
        logger.info(`SLA escalation #${t.id}: at critical, escalation level ${nextLevel}`)
      }
    }
  }
}
