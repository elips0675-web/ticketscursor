import prisma from './prisma.js'
import logger from './logger.js'
import { sendTicketNotification } from './email.js'
import { isFeatureEnabled } from './feature-flags.js'

const POLL_INTERVAL = 100
const BATCH_SIZE = 50
export const MAX_ATTEMPTS = 3
export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000]
export const OUTBOX_RETRY_FLAG = 'outbox_retry'

let running = false
let timer = null

export function retryDelayMs(attempts) {
  const index = Math.min(Math.max(Number(attempts) || 1, 1), RETRY_BACKOFF_MS.length) - 1
  return RETRY_BACKOFF_MS[index]
}

async function alertPermanentFailure(row, error, attempts) {
  logger.error('Outbox event failed permanently', {
    eventId: row.id,
    eventType: row.event_type,
    attempts,
    error,
  })
  try {
    const admins = await prisma.employees.findMany({
      where: { is_active: true, role: { in: ['super_admin', 'admin'] } },
      select: { email: true },
    })
    for (const admin of admins) {
      if (!admin.email) continue
      sendTicketNotification({
        to: admin.email,
        subject: `Outbox alert: ${row.event_type} failed`,
        text: `Событие #${row.id} (${row.event_type}) не доставлено после ${attempts} попыток: ${error}`,
      }).catch(() => {})
    }
  } catch (err) {
    logger.error('Outbox alert failed:', err.message)
  }
}

async function recordFailure(row, err, retryEnabled) {
  const error = String(err?.message || err).slice(0, 1000)

  if (!retryEnabled) {
    logger.error('Outbox worker send error:', { eventId: row.id, error })
    return
  }

  const attempts = Number(row.attempts || 0) + 1

  if (attempts >= MAX_ATTEMPTS) {
    await prisma.event_outbox.update({
      where: { id: row.id },
      data: { attempts, status: 'failed', last_error: error, next_attempt_at: null },
    })
    await alertPermanentFailure(row, error, attempts)
    return
  }

  const nextAttemptAt = new Date(Date.now() + retryDelayMs(attempts))
  await prisma.event_outbox.update({
    where: { id: row.id },
    data: { attempts, status: 'retrying', last_error: error, next_attempt_at: nextAttemptAt },
  })
  logger.warn('Outbox event scheduled for retry', {
    eventId: row.id,
    attempts,
    nextAttemptAt: nextAttemptAt.toISOString(),
  })
}

export function startOutboxWorker(getIO) {
  if (running) return
  running = true
  logger.info('Outbox worker started')

  const poll = async () => {
    if (!running) return

    try {
      const retryEnabled = await isFeatureEnabled(OUTBOX_RETRY_FLAG).catch(() => false)
      const where = { sent_at: null, status: { in: ['pending', 'retrying'] } }
      if (retryEnabled) {
        where.OR = [{ next_attempt_at: null }, { next_attempt_at: { lte: new Date() } }]
      }

      const rows = await prisma.event_outbox.findMany({
        where,
        orderBy: { created_at: 'asc' },
        take: BATCH_SIZE,
      })
      if (!Array.isArray(rows)) return

      for (const row of rows) {
        try {
          const io = getIO()
          if (!io) {
            logger.warn('Socket.IO unavailable, retrying outbox events later')
            break
          }

          let payload
          try {
            payload = JSON.parse(row.payload)
          } catch {
            payload = { raw: row.payload }
          }

          if (row.room) {
            io.to(row.room).emit(row.event_type, payload)
          } else {
            io.emit(row.event_type, payload)
          }

          await prisma.event_outbox.update({
            where: { id: row.id },
            data: { sent_at: new Date(), status: 'sent', last_error: null, next_attempt_at: null },
          })
        } catch (err) {
          await recordFailure(row, err, retryEnabled)
        }
      }
    } catch (err) {
      logger.error('Outbox worker poll error:', err.message)
    }

    if (running) {
      timer = setTimeout(poll, POLL_INTERVAL)
    }
  }

  poll()
}

export function stopOutboxWorker() {
  running = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  logger.info('Outbox worker stopped')
}
