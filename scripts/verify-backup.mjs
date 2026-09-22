/**
 * verify-backup.mjs — проверка, что последний mysqldump реально разворачивается.
 *
 * Сценарий (Промт 4 из «Доделать.rtf»):
 *   1. Взять последний .sql из backups/ (или передать путь аргументом)
 *   2. Создать БД servicedesk_verify
 *   3. mysql < backup.sql
 *   4. Проверить: SELECT COUNT(*) FROM tickets > 0, employees > 0
 *   5. DROP DATABASE servicedesk_verify
 *   6. Exit 0/1
 *
 * Параметры — из env (как в CI): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
 *   DB_NAME используется только как базовое имя для verify-БД (по умолчанию servicedesk).
 *
 * Запуск:
 *   node scripts/verify-backup.mjs                  # последний .sql из backups/
 *   node scripts/verify-backup.mjs path/to/dump.sql # конкретный дамп
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const DB_HOST = process.env.DB_HOST || '127.0.0.1'
const DB_PORT = process.env.DB_PORT || '3306'
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''
const BASE_DB = process.env.DB_NAME || 'servicedesk'
const VERIFY_DB = `${BASE_DB}_verify`

function mysql(args, opts = {}) {
  const base = ['-h', DB_HOST, '-P', DB_PORT, '-u', DB_USER]
  if (DB_PASSWORD) base.push(`-p${DB_PASSWORD}`)
  return execFileSync('mysql', [...base, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  })
}

function pickBackup() {
  const dir = path.resolve('backups')
  if (!readdirSync(dir).length) {
    throw new Error(`backups/ пуст — нечего проверять (искали в ${dir})`)
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  if (!files.length) throw new Error('backups/ не содержит *.sql')
  return path.join(dir, files[0].f)
}

async function main() {
  const backupFile = process.argv[2] ? path.resolve(process.argv[2]) : pickBackup()
  console.log(`[verify-backup] Дамп: ${backupFile}`)
  if (!statSync(backupFile).isFile()) throw new Error(`Файл не найден: ${backupFile}`)

  console.log(`[verify-backup] Создаю БД ${VERIFY_DB}...`)
  mysql(['-e', `DROP DATABASE IF EXISTS ${VERIFY_DB}; CREATE DATABASE ${VERIFY_DB};`])

  try {
    console.log('[verify-backup] Импортирую дамп...')
    // stdin из файла — как «mysql < backup.sql»
    const fs = await import('node:fs')
    const buf = fs.readFileSync(backupFile)
    mysql([VERIFY_DB], { input: buf })

    console.log('[verify-backup] Проверяю данные...')
    const tickets = mysql(['-N', '-e', `SELECT COUNT(*) FROM ${VERIFY_DB}.tickets;`]).trim()
    const employees = mysql(['-N', '-e', `SELECT COUNT(*) FROM ${VERIFY_DB}.employees;`]).trim()

    const t = parseInt(tickets, 10)
    const e = parseInt(employees, 10)
    if (!Number.isFinite(t) || !Number.isFinite(e)) throw new Error('Не удалось прочитать COUNT (*)')
    if (t <= 0) throw new Error(`tickets пуст: COUNT=${tickets}`)
    if (e <= 0) throw new Error(`employees пуст: COUNT=${employees}`)

    console.log(`[verify-backup] ✅ tickets=${tickets}, employees=${employees}`)
  } finally {
    console.log(`[verify-backup] DROP DATABASE ${VERIFY_DB}...`)
    mysql(['-e', `DROP DATABASE IF EXISTS ${VERIFY_DB};`])
  }
  console.log('[verify-backup] OK — дамп разворачивается без ошибок')
}

main().catch((err) => {
  console.error('[verify-backup] FAILED:', err.message)
  process.exit(1)
})