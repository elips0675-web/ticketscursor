import logger from './logger.js'
import { notifySlaBreached } from './notify.js'

const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000
const SLA_CHECK_INTERVAL = 15 * 60 * 1000

export async function setupBackgroundJobs(prisma) {
  if (process.env.REDIS_URL) {
    const { Queue, Worker, QueueScheduler } = await import('bullmq')
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
    setInterval(() => runCleanup(prisma), CLEANUP_INTERVAL)
    setInterval(() => runSlaCheck(prisma), SLA_CHECK_INTERVAL)
    logger.info('Background jobs using setInterval (no Redis)')
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
