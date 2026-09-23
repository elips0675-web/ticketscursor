import prisma from './prisma.js'
import logger from './logger.js'

const POLL_INTERVAL = 100
const BATCH_SIZE = 50
let running = false
let timer = null

export function startOutboxWorker(getIO) {
  if (running) return
  running = true
  logger.info('Outbox worker started')

  const poll = async () => {
    if (!running) return

    try {
      const rows = await prisma.event_outbox.findMany({
        where: { sent_at: null },
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
            data: { sent_at: new Date() },
          })
        } catch (err) {
          logger.error('Outbox worker send error:', { eventId: row.id, error: err.message })
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
