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

export async function prepareTestDatabase() {
  const { host, port, user, password, dbName } = getTestDbConfig()

  const conn = await mysql.createConnection({ host, port, user, password })
  await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.execute(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()

  const knexEnv = { ...process.env, DB_HOST: host, DB_PORT: String(port), DB_USER: user, DB_PASSWORD: password, DB_NAME: dbName }
  execSync('npx knex migrate:latest --knexfile knexfile.js', { cwd: SERVER_DIR, stdio: 'pipe', env: knexEnv })

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