// Общая подготовка тестовой БД (P1 №11 Что-доделать.txt): используется и
// vitest.global-setup.js (серверные тесты), и scripts/e2e-db-setup.mjs (CI-E2E).
// Параметры подключения — из env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/TEST_DB_NAME),
// локальные дефолты совпадают со старым хардкодом vitest.global-setup.js
// (localhost/3306/root/''/servicedesk_test).
import mysql from 'mysql2/promise'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

export function getTestDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dbName: process.env.TEST_DB_NAME || 'servicedesk_test',
  }
}

async function addColumnIfNotExists(conn, dbName, table, column, definition) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  )
  if (rows[0].cnt === 0) {
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
  }
}

export async function prepareTestDatabase() {
  const { host, port, user, password, dbName } = getTestDbConfig()

  const conn = await mysql.createConnection({ host, port, user, password })
  await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.execute(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()

  const knexEnv = { ...process.env, DB_HOST: host, DB_PORT: String(port), DB_USER: user, DB_PASSWORD: password, DB_NAME: dbName }
  execSync('npx knex migrate:latest --knexfile knexfile.js', { cwd: SERVER_DIR, stdio: 'pipe', env: knexEnv })

  const fix = await mysql.createConnection({ host, port, user, password, database: dbName })

  // Fix column types that Knex creates incorrectly
  await fix.execute('ALTER TABLE employees MODIFY COLUMN role VARCHAR(20) NOT NULL')
  await fix.execute('ALTER TABLE tickets MODIFY COLUMN status VARCHAR(20) NOT NULL')
  await fix.execute('ALTER TABLE tickets MODIFY COLUMN priority VARCHAR(20) NOT NULL')

  // Add all columns Prisma expects but Knex doesn't create
  await addColumnIfNotExists(fix, dbName, 'employees', 'last_active', 'DATETIME NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'sla_paused_at', 'DATETIME NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'sla_accumulated_ms', 'INT NOT NULL DEFAULT 0')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'email_message_id', 'VARCHAR(500) DEFAULT NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'locked_by', 'INT NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'locked_at', 'DATETIME NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'deleted_at', 'DATETIME NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'escalated_at', 'DATETIME NULL')
  await addColumnIfNotExists(fix, dbName, 'tickets', 'escalation_level', 'INT NOT NULL DEFAULT 0')

  // Create custom field tables if not exist
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
    field_id INT NOT NULL,
    value TEXT,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  )`)

  await fix.end()

  execSync('npx knex seed:run --knexfile knexfile.js', { cwd: SERVER_DIR, stdio: 'pipe', env: knexEnv })

  const url = `mysql://${user}:${password}@${host}:${port}/${dbName}`
  return { dbName, url }
}

export async function teardownTestDatabase() {
  const { host, port, user, password, dbName } = getTestDbConfig()
  const conn = await mysql.createConnection({ host, port, user, password })
  await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.end()
}