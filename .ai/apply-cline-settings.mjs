// Предзаполнение настроек Cline (saoudrizwan.claude-dev) в глобальном состоянии VS Code.
//
// Зачем: Cline хранит провайдера/модель/авто-одобрение в globalState (state.vscdb),
// а не в settings.json, поэтому UI-настройку нельзя положить в репозиторий.
// Скрипт делает это идемпотентно и с бэкапом.
//
// Использование (VS Code должен быть ЗАКРЫТ, иначе правка не подхватится):
//   node .ai/apply-cline-settings.mjs --dry-run
//   node .ai/apply-cline-settings.mjs
//
// После запуска: открыть VS Code → Cline уже настроен на Ollama.

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry-run')
const MODEL = process.env.CLINE_MODEL || 'servicedesk-qwen'
const BASE_URL = process.env.CLINE_OLLAMA_URL || 'http://localhost:11434'
const CTX = process.env.CLINE_CTX || '16384'
const KEY = 'saoudrizwan.claude-dev'

const dbPath = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'state.vscdb')
if (!fs.existsSync(dbPath)) {
  console.error('Не найден state.vscdb:', dbPath)
  process.exit(1)
}

const settings = {
  // провайдер и модель (legacy-ключи + режимы Plan/Act — Cline читает разные в разных версиях)
  apiProvider: 'ollama',
  apiModelId: MODEL,
  ollamaModelId: MODEL,
  ollamaBaseUrl: BASE_URL,
  ollamaApiOptionsCtxNum: CTX,
  planModeApiProvider: 'ollama',
  actModeApiProvider: 'ollama',
  planModeOllamaModelId: MODEL,
  actModeOllamaModelId: MODEL,
  planActSeparateModelsSetting: false,
  // чекпоинты Cline делают снапшоты рабочей копии — на большом репозитории это лишний диск
  enableCheckpointsSetting: false,
  welcomeViewCompleted: true,
  // авто-одобрение: чтение/поиск — да, запись и произвольные команды — нет
  autoApprovalSettings: {
    version: 2,
    enabled: true,
    favorites: [],
    maxRequests: 20,
    actions: {
      readFiles: true,
      readFilesExternally: true,
      editFiles: false,
      editFilesExternally: false,
      executeSafeCommands: true,
      executeAllCommands: false,
      useBrowser: false,
      useMcp: false,
    },
    enableNotifications: false,
  },
}

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA busy_timeout = 5000')

const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(KEY)
let current = {}
let isBuffer = false
if (row?.value != null) {
  isBuffer = row.value instanceof Uint8Array
  const text = isBuffer ? Buffer.from(row.value).toString('utf8') : String(row.value)
  try {
    current = JSON.parse(text)
  } catch {
    current = {}
  }
}

const next = { ...current, ...settings }
const payload = JSON.stringify(next)
const changed = JSON.stringify(current) !== payload

console.log(`state.vscdb: ${dbPath}`)
console.log(`ключ ${KEY}: было ${Object.keys(current).length} полей, станет ${Object.keys(next).length}`)
for (const k of Object.keys(settings)) {
  const before = JSON.stringify(current[k])
  const after = JSON.stringify(settings[k])
  console.log(`  ${before === after ? '=' : '~'} ${k}: ${before ?? '—'} → ${after}`)
}

if (!changed) {
  console.log('\nУже настроено, изменений нет.')
  db.close()
  process.exit(0)
}
if (DRY) {
  console.log('\n--dry-run: ничего не записано.')
  db.close()
  process.exit(0)
}

const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
fs.copyFileSync(dbPath, backup)
console.log(`\nБэкап: ${backup}`)

const value = isBuffer ? Buffer.from(payload, 'utf8') : payload
db.exec('BEGIN IMMEDIATE')
try {
  if (row) db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(value, KEY)
  else db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(KEY, value)
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Не удалось записать настройки:', err.message)
  db.close()
  process.exit(1)
}

const check = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(KEY)
const text = check.value instanceof Uint8Array ? Buffer.from(check.value).toString('utf8') : String(check.value)
console.log('Проверка записи:', JSON.parse(text).actModeOllamaModelId)
db.close()
console.log('\nГотово. Перезапустите VS Code, чтобы Cline подхватил настройки.')
