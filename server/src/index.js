import 'dotenv/config'
import knex from 'knex'
import knexConfig from '../knexfile.js'
import { app, server } from './app.js'
import { setupSocket } from './socket.js'
import { initTelegram } from './telegram.js'

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required')
  console.error('Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  process.exit(1)
}

const PORT = process.env.PORT || 4000

setupSocket(server)
initTelegram()

// Auto-run migrations on startup
;(async () => {
  try {
    const db = knex(knexConfig)
    await db.migrate.latest()
    console.log('Migrations up to date')
    await db.destroy()
  } catch (e) {
    console.error('Migration error:', e.message)
  }
})()

// Удаление уведомлений старше 90 дней (каждые 6 часов)
import pool from './db.js'

async function cleanupOldNotifications() {
  try {
    const [r] = await pool.query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 90 DAY")
    if (r.affectedRows > 0) console.log(`Cleaned ${r.affectedRows} old notifications`)
  } catch (e) {
    console.error('Notification cleanup error:', e.message)
  }
}
cleanupOldNotifications()
setInterval(cleanupOldNotifications, 6 * 60 * 60 * 1000)

server.listen(PORT, () => {
  console.log(`Service Desk API running on port ${PORT}`)
})
