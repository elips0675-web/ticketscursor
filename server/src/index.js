import 'dotenv/config'
import knexLib from 'knex'
import knexConfig from '../knexfile.js'
import { app, server } from './app.js'
import { setupSocket } from './socket.js'
import { initTelegram } from './telegram.js'
import logger from './logger.js'
import { setupBackgroundJobs } from './background.js'

if (!process.env.JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET environment variable is required')
  logger.error('Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  process.exit(1)
}

const PORT = process.env.PORT || 4000

setupSocket(server)
initTelegram()

import { initSearchSync } from './search-sync.js'
initSearchSync()

// Auto-run migrations on startup
;(async () => {
  try {
    const migrator = knexLib(knexConfig)
    await migrator.migrate.latest()
    console.log('Migrations up to date')
    await migrator.destroy()
  } catch (e) {
    logger.error('Migration error:', e.message)
  }
})()

// Удаление уведомлений старше 90 дней (каждые 6 часов)
import prisma from './prisma.js'
setupBackgroundJobs(prisma)

server.listen(PORT, () => {
  console.log(`Service Desk API running on port ${PORT}`)
})

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`)
  server.close(() => {
    console.log('HTTP server closed')
  })
  const { getIO } = await import('./socket.js')
  const io = getIO()
  if (io) {
    io.close(() => console.log('Socket.IO closed'))
  }
  await prisma.$disconnect().catch(() => {})
  logger.info(`Server shut down (${signal})`)
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
