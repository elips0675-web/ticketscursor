import 'dotenv/config'
import knex from 'knex'
import knexConfig from '../knexfile.js'
import { app, server } from './app.js'
import { setupSocket } from './socket.js'
import { initTelegram } from './telegram.js'

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

server.listen(PORT, () => {
  console.log(`Service Desk API running on port ${PORT}`)
})
