import logger from './logger.js'
import { sendTicketNotification } from './email.js'
import { notifySlaBreached } from './notify.js'

const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000
const SLA_CHECK_INTERVAL = 15 * 60 * 1000

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

let cleanupTimer, slaTimer

export function stopBackgroundJobs() {
  if (cleanupTimer) clearInterval(cleanupTimer)
  if (slaTimer) clearInterval(slaTimer)
}

export async function setupBackgroundJobs(prisma) {
  if (process.env.REDIS_URL) {
    const { Queue, Worker } = await import('bullmq')
    const Redis = (await import('ioredis')).default

    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })

    const cleanupQueue = new Queue('notification-cleanup', { connection })
    const slaQueue = new Queue('sla-overdue-check', { connection })

    new Worker('notification-cleanup', async () => {
      return runCleanup(prisma)
    }, { connection })

    new Worker('sla-overdue-check', async () => {
      return runSlaCheck(prisma)
    }, { connection })

    await cleanupQueue.upsertJobScheduler('default', { every: CLEANUP_INTERVAL })
    await slaQueue.upsertJobScheduler('default', { every: SLA_CHECK_INTERVAL })

    runCleanup(prisma)
    runSlaCheck(prisma)

    logger.info('Background jobs using BullMQ (Redis)')
  } else {
    setTimeout(() => runCleanup(prisma), 5000)
    setTimeout(() => runSlaCheck(prisma), 5000)
    cleanupTimer = setInterval(() => runCleanup(prisma), CLEANUP_INTERVAL)
    slaTimer = setInterval(() => runSlaCheck(prisma), SLA_CHECK_INTERVAL)
    logger.warn('Redis not configured — background jobs using setInterval (no guarantees)')
    warnAdminRedisMissing(prisma)
  }
}

async function runCleanup(prisma) {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const r = await prisma.notifications.deleteMany({
      where: { created_at: { lt: cutoff } },
    })
    if (r.count > 0) logger.info(`Cleaned ${r.count} old notifications`)
  } catch (e) {
    logger.error('Notification cleanup error:', e.message)
  }
}

async function runSlaCheck(prisma) {
  try {
    const overdue = await prisma.tickets.findMany({
      where: {
        status: { in: ['open', 'in_progress'] },
        due_at: { lt: new Date() },
      },
      select: { id: true },
      take: 200,
    })
    for (const t of overdue) {
      await notifySlaBreached(t.id)
    }
  } catch (e) {
    logger.error('SLA overdue check error:', e.message)
  }
}
