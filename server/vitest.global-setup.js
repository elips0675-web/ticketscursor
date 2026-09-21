import mysql from 'mysql2/promise'
import { execSync } from 'child_process'

const dbName = 'servicedesk_test'

export async function setup() {
  const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', port: 3306 })
  await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.execute(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()

  const knexEnv = { ...process.env, DB_HOST: 'localhost', DB_PORT: '3306', DB_USER: 'root', DB_PASSWORD: '', DB_NAME: dbName }
  execSync('npx knex migrate:latest --knexfile knexfile.js', { stdio: 'pipe', env: knexEnv })

  const fix = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: dbName })
  await fix.execute('ALTER TABLE employees MODIFY COLUMN role VARCHAR(20) NOT NULL')
  await fix.execute('ALTER TABLE tickets MODIFY COLUMN status VARCHAR(20) NOT NULL')
  await fix.execute('ALTER TABLE tickets MODIFY COLUMN priority VARCHAR(20) NOT NULL')
  await fix.execute('ALTER TABLE tickets ADD COLUMN sla_paused_at DATETIME NULL')
  await fix.execute('ALTER TABLE tickets ADD COLUMN sla_accumulated_ms INT NOT NULL DEFAULT 0')
  await fix.execute('ALTER TABLE tickets ADD COLUMN email_message_id VARCHAR(500) DEFAULT NULL')
  await fix.execute(`CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL DEFAULT 'text',
    options JSON,
    required TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  )`)
  await fix.execute(`CREATE TABLE IF NOT EXISTS custom_field_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    definition_id INT NOT NULL,
    value TEXT,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  )`)
  await fix.end()

  execSync('npx knex seed:run --knexfile knexfile.js', { stdio: 'pipe', env: knexEnv })

  process.env.DATABASE_URL = `mysql://root:@localhost:3306/${dbName}`
  process.env.DIRECT_DATABASE_URL = `mysql://root:@localhost:3306/${dbName}`
  process.env.DB_NAME = dbName
  process.env.NODE_ENV = 'test'
  process.env.VAPID_PUBLIC_KEY = 'BKvM9b1p0vP3Q8j5tL7mW9nC4rX6yZ2aB8dE0gI3kO5sU7wY1cF4hJ6lN8pR2tV'
  process.env.VAPID_PRIVATE_KEY = 'z9x8c7v6b5n4m3l2k1j0h9g8f7d6s5a4'
}

export async function teardown() {
  const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', port: 3306 })
  await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.end()
}
