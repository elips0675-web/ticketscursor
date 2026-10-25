// Серверная часть гейта «migrations-lag» (scripts/migrations-lag-audit.mjs).
//
// Лежит в server/, потому что knex и mysql2 установлены только здесь
// (корневой package.json их не содержит). Гейт импортирует этот модуль
// динамически — только в живом режиме; статические проверки работают без
// зависимостей (см. `--offline`).
//
// Все параметры подключения берутся из того же knexfile.js и тех же env, что и
// `npm run migrate`: гейт не держит собственную копию конфига (иначе он сверял
// бы реальность со своей константой).
//
// Список таблиц читается ТЕМ ЖЕ пулом, что и применённые миграции (one pool):
// отдельный knex для information_schema падал на временной БД с ER_BAD_DB_ERROR
// (1 отказ из 3–6 прогонов `--setup`) — лишнее соединение к только что
// созданной схеме не успевало её увидеть.
import { createConnection } from 'mysql2/promise'
import knexFactory from 'knex'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import knexfile from './knexfile.js'

const MIGRATION_TABLE = 'knex_migrations'
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

// knex разрешает относительный migrations.directory от process.cwd(), поэтому из
// корня репозитория «./migrations» указывал бы в пустоту (ENOENT). Приводим путь
// к абсолютному от каталога server/ — гейт тогда работает из любого cwd.
export function configFor(dbName) {
  const migrations = { ...(knexfile.migrations || {}) }
  const dir = migrations.directory || './migrations'
  migrations.directory = path.isAbsolute(dir) ? dir : path.resolve(SERVER_DIR, dir)
  return {
    ...knexfile,
    connection: { ...knexfile.connection, database: dbName },
    migrations,
  }
}

export function defaultDatabaseName() {
  return process.env.DB_NAME || 'servicedesk'
}

async function readTableNames(knex, dbName) {
  const rows = await knex('information_schema.tables')
    .where({ table_schema: dbName, table_type: 'BASE TABLE' })
    .select('table_name as name')
  return rows.map((row) => row.name)
}

/**
 * Применённые миграции (и, при `withTables`, список базовых таблиц — тем же
 * соединением, что и `migrate:latest`, без второго пула).
 */
export async function readAppliedMigrations(dbName, { migrate = false, withTables = false } = {}) {
  const knex = knexFactory(configFor(dbName))
  try {
    if (migrate) await knex.migrate.latest()
    const tableExists = await knex.schema.hasTable(MIGRATION_TABLE)
    const tables = withTables ? await readTableNames(knex, dbName) : []
    if (!tableExists) return { applied: [], tableExists, tables }
    const rows = await knex(MIGRATION_TABLE).select('name').orderBy('id', 'asc')
    return { applied: rows.map((row) => row.name), tableExists, tables }
  } finally {
    await knex.destroy()
  }
}

export async function createDatabase(dbName) {
  const base = { ...knexfile.connection }
  const conn = await createConnection({
    host: base.host,
    port: base.port,
    user: base.user,
    password: base.password,
  })
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
    await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } finally {
    await conn.end()
  }
}

export async function dropDatabase(dbName) {
  const base = { ...knexfile.connection }
  const conn = await createConnection({
    host: base.host,
    port: base.port,
    user: base.user,
    password: base.password,
  })
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
  } finally {
    await conn.end()
  }
}
