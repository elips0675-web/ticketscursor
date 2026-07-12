import mysql from 'mysql2/promise'

const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '' })
await conn.execute('DROP DATABASE IF EXISTS servicedesk')
await conn.execute('CREATE DATABASE servicedesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
await conn.end()

// Database recreated, now server needs to run migrations first
// Then we seed via mysql2 which handles UTF-8 properly

console.log('DB reset done. Start the server, then run seed-via-node.mjs')
process.exit(0)
