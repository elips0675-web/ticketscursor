import mysql from 'mysql2/promise'

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'servicedesk',
})

try {
  await conn.execute(
    'ALTER TABLE tickets ADD COLUMN email_message_id VARCHAR(500) DEFAULT NULL'
  )
  console.log('✅ Added email_message_id column')
} catch (err) {
  if (err.code === 'ER_DUP_FIELDNAME') {
    console.log('ℹ️  email_message_id already exists')
  } else {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

await conn.end()
