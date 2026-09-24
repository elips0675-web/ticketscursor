// Операции админки (Этап 58): health-проверки, очередь, миграции, restore, reindex.
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import prisma from '../prisma.js'
import logger from '../logger.js'
import { getSettings } from '../settings.js'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..', '..')
const migrationsDir = path.join(projectRoot, 'server', 'migrations')

export async function checkDatabase() {
  const start = Date.now()
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    return { name: 'db', label: 'База данных', ok: true, latency: Date.now() - start }
  } catch (err) {
    return { name: 'db', label: 'База данных', ok: false, latency: Date.now() - start, message: err.message }
  }
}

export async function checkRedis() {
  const settings = await getSettings()
  const url = settings.REDIS_URL || process.env.REDIS_URL || ''
  if (!url) {
    return { name: 'redis', label: 'Redis', ok: false, message: 'не настроен (REDIS_URL пуст)' }
  }
  const { default: Redis } = await import('ioredis')
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null })
  const start = Date.now()
  try {
    await client.connect()
    await client.ping()
    return { name: 'redis', label: 'Redis', ok: true, latency: Date.now() - start }
  } catch (err) {
    return { name: 'redis', label: 'Redis', ok: false, latency: Date.now() - start, message: err.message }
  } finally {
    client.disconnect()
  }
}

export async function checkMeili() {
  const url = process.env.MEILISEARCH_URL || 'http://localhost:7700'
  const key = process.env.MEILI_MASTER_KEY || 'meilisearch-master-key'
  const start = Date.now()
  try {
    const res = await fetch(`${url}/health`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
    })
    const body = await res.json().catch(() => ({}))
    return { name: 'meili', label: 'Meilisearch', ok: res.ok, latency: Date.now() - start, message: body.status || `HTTP ${res.status}` }
  } catch (err) {
    return { name: 'meili', label: 'Meilisearch', ok: false, latency: Date.now() - start, message: err.message }
  }
}

export async function checkSmtp() {
  const settings = await getSettings()
  const host = settings.SMTP_HOST || process.env.SMTP_HOST || ''
  const port = settings.SMTP_PORT || process.env.SMTP_PORT || ''
  if (!host || !port) {
    return { name: 'smtp', label: 'SMTP', ok: false, message: 'SMTP не настроен' }
  }
  return { name: 'smtp', label: 'SMTP', ok: true, message: `${host}:${port}` }
}

export async function checkImap() {
  const settings = await getSettings()
  const host = settings.IMAP_HOST || ''
  const port = settings.IMAP_PORT || ''
  if (!host) {
    return { name: 'imap', label: 'IMAP', ok: false, message: 'IMAP не настроен' }
  }
  return { name: 'imap', label: 'IMAP', ok: true, message: `${host}:${port}` }
}

const QUEUE_NAMES = ['service-desk-dlq', 'notification-cleanup', 'sla-overdue-check', 'recurrence-check']

export async function getQueueStats() {
  const settings = await getSettings()
  const redisUrl = settings.REDIS_URL || process.env.REDIS_URL || ''
  if (!redisUrl) {
    return {
      mode: 'in-memory',
      queues: [],
      note: 'Redis не настроен — фоновые задачи работают через setInterval (встроенный fallback). Для очередей BullMQ включите Redis в разделе «Операции».',
    }
  }
  const { default: Redis } = await import('ioredis')
  const { Queue } = await import('bullmq')
  const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2, retryStrategy: () => null })
  const queues = []
  try {
    await client.connect()
    for (const name of QUEUE_NAMES) {
      const q = new Queue(name, { connection: client })
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
        queues.push({ name, ...counts })
      } catch (err) {
        queues.push({ name, error: err.message })
      } finally {
        await q.close().catch(() => {})
      }
    }
  } catch (err) {
    return { mode: 'bullmq', queues, note: `Не удалось подключиться к Redis: ${err.message}` }
  } finally {
    client.disconnect()
  }
  return { mode: 'bullmq', queues }
}

export async function getMigrations() {
  let applied = []
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT name, batch, migration_time FROM knex_migrations ORDER BY id')
    applied = (rows || []).map((r) => ({ name: r.name, batch: r.batch ?? null, time: r.migration_time ?? null }))
  } catch (err) {
    logger.warn('knex_migrations query failed:', err.message)
  }
  const appliedNames = new Set(applied.map((a) => a.name))
  let pending
  try {
    const files = await fs.readdir(migrationsDir)
    pending = files.filter((f) => /\.(js|sql)$/.test(f) && !appliedNames.has(f)).sort()
  } catch {
    pending = []
  }
  return { applied, pending, appliedCount: applied.length, pendingCount: pending.length }
}

export async function restoreBackup(content) {
  const sql = String(content || '').trim()
  if (!sql) return { ok: false, message: 'Пустой бэкап' }
  const user = process.env.DB_USER || 'root'
  const pass = process.env.DB_PASSWORD || ''
  const db = process.env.DB_NAME || 'servicedesk'
  const tmpFile = path.join(os.tmpdir(), `restore-${Date.now()}.sql`)
  await fs.writeFile(tmpFile, sql, 'utf8')
  const passArg = pass ? `-p${pass}` : ''
  const cmd = `mysql -u ${user} ${passArg} ${db} < "${tmpFile}"`
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 120000, shell: process.env.ComSpec || 'cmd.exe' })
    await fs.unlink(tmpFile).catch(() => {})
    return { ok: true, output: (stdout || stderr || '').trim().slice(0, 500) }
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {})
    return { ok: false, message: (err.stderr || err.message || 'Ошибка восстановления').slice(0, 500) }
  }
}

export async function reindexSearch() {
  const { reindexAll } = await import('../search-sync.js')
  return reindexAll()
}