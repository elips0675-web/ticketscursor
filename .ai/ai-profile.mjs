// Переключение профилей «локально ↔ облако» для Cline (VS Code) и OpenCode.
//
// Что меняет:
//   OpenCode  — opencode.json: model + default_agent (конфиг подхватывается без перезапуска,
//               но модель уже открытой сессии не меняется: нужна новая сессия или /models).
//   Cline     — globalState расширения saoudrizwan.claude-dev в state.vscdb
//               (провайдер, модель, base URL, context window). VS Code должен быть закрыт.
//
// Использование (из корня репозитория):
//   node .ai/ai-profile.mjs status
//   node .ai/ai-profile.mjs local
//   node .ai/ai-profile.mjs local-q5
//   node .ai/ai-profile.mjs local14
//   node .ai/ai-profile.mjs cloud
//   node .ai/ai-profile.mjs cloud-ollama
//   node .ai/ai-profile.mjs cloud --dry-run
//   node .ai/ai-profile.mjs local --opencode-only
//   node .ai/ai-profile.mjs local --cline-only
//
// Переменные окружения (необязательно):
//   OLLAMA_URL                — по умолчанию http://127.0.0.1:11434
//   AI_CLOUD_OLLAMA_MODEL     — по умолчанию gpt-oss:120b-cloud
//   AI_CLOUD_OPENCODE_MODEL   — по умолчанию opencode/deepseek-v4.1-flash-free

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
const CLOUD_OLLAMA = process.env.AI_CLOUD_OLLAMA_MODEL || 'gpt-oss:120b-cloud'
const CLOUD_OPENCODE = process.env.AI_CLOUD_OPENCODE_MODEL || 'opencode/deepseek-v4.1-flash-free'

const OPENCODE_FILE = path.join(ROOT, 'opencode.json')
const OPENCODE_JSONC = path.join(ROOT, 'opencode.jsonc')
const CLINE_KEY = 'saoudrizwan.claude-dev'
const CLINE_DB = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'state.vscdb')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const PROFILES = {
  local: {
    title: 'локальная 7B · 16k (офлайн)',
    cline: { provider: 'ollama', model: 'servicedesk-qwen', baseUrl: OLLAMA_URL, ctx: 16384 },
    opencode: { model: 'ollama/servicedesk-qwen:latest', agent: 'local' },
  },
  'local-q5': {
    title: 'локальная 7B Q5_K_M · 16k (чуть качественнее, ~6.5 ГБ VRAM)',
    cline: { provider: 'ollama', model: 'servicedesk-qwen-q5', baseUrl: OLLAMA_URL, ctx: 16384 },
    opencode: { model: 'ollama/servicedesk-qwen-q5:latest', agent: 'local' },
  },
  local14: {
    title: 'локальная 14B · 8k (нужно ~10 ГБ VRAM)',
    cline: { provider: 'ollama', model: 'servicedesk-qwen-14b', baseUrl: OLLAMA_URL, ctx: 8192 },
    opencode: { model: 'ollama/servicedesk-qwen-14b:latest', agent: 'local' },
  },
  cloud: {
    title: `облако: Cline — Ollama ${CLOUD_OLLAMA}, OpenCode — ${CLOUD_OPENCODE}`,
    cline: { provider: 'ollama', model: CLOUD_OLLAMA, baseUrl: OLLAMA_URL, ctx: 32768 },
    opencode: { model: CLOUD_OPENCODE, agent: 'cloud' },
  },
  'cloud-ollama': {
    title: `облако Ollama в обоих: ${CLOUD_OLLAMA}`,
    cline: { provider: 'ollama', model: CLOUD_OLLAMA, baseUrl: OLLAMA_URL, ctx: 32768 },
    opencode: { model: `ollama/${CLOUD_OLLAMA}`, agent: 'cloud' },
  },
}

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const positional = argv.filter((a) => !a.startsWith('--'))
const command = positional[0] || 'status'
const dryRun = flags.has('--dry-run')
const opencodeOnly = flags.has('--opencode-only')
const clineOnly = flags.has('--cline-only')
const force = flags.has('--force')
const wantsOpencode = !clineOnly
const wantsCline = !opencodeOnly

const log = (...a) => console.log(...a)
const warn = (...a) => console.warn(...a)

function usage() {
  log(`Профили:
  local         ${PROFILES.local.title}
  local-q5      ${PROFILES['local-q5'].title}
  local14       ${PROFILES.local14.title}
  cloud         ${PROFILES.cloud.title}
  cloud-ollama  ${PROFILES['cloud-ollama'].title}
  status        показать текущие настройки (по умолчанию)

Флаги:
  --dry-run        показать, что изменится, ничего не записывать
  --opencode-only  трогать только opencode.json
  --cline-only     трогать только настройки Cline (VS Code должен быть закрыт)
  --force          писать настройки Cline даже при запущенном VS Code (риск потери)
  --help           эта справка

Примеры:
  .ai\\switch-ai.bat local
  .ai\\switch-ai.bat cloud --dry-run
  node .ai/ai-profile.mjs status`)
}

function baseOpencodeConfig() {
  return {
    $schema: 'https://opencode.ai/config.json',
    model: 'ollama/servicedesk-qwen:latest',
    default_agent: 'local',
    providers: {
      ollama: {
        models: {
          'servicedesk-qwen:latest': {
            name: 'servicedesk-qwen 7B · 16k · локально',
            limit: { context: 16384, output: 4096 },
            capabilities: { tools: true, input: ['text'], output: ['text'] },
          },
          'servicedesk-qwen-q5:latest': {
            name: 'servicedesk-qwen 7B Q5_K_M · 16k · локально',
            limit: { context: 16384, output: 4096 },
            capabilities: { tools: true, input: ['text'], output: ['text'] },
          },
          'servicedesk-qwen-14b:latest': {
            name: 'servicedesk-qwen 14B · 8k · локально',
            limit: { context: 8192, output: 4096 },
            capabilities: { tools: true, input: ['text'], output: ['text'] },
          },
          [CLOUD_OLLAMA]: {
            name: `${CLOUD_OLLAMA} · Ollama Cloud`,
            limit: { context: 131072, output: 16384 },
            capabilities: { tools: true, input: ['text'], output: ['text'] },
          },
        },
      },
    },
    agents: {
      local: {
        description: '3060: одна узкая правка одного файла, без сети',
        mode: 'primary',
        steps: 10,
        permissions: [
          { action: 'webfetch', resource: '*', effect: 'deny' },
          { action: 'websearch', resource: '*', effect: 'deny' },
        ],
      },
      cloud: {
        description: 'Эскалация: многофайловые задачи, ревью диффа, миграции',
        mode: 'primary',
      },
    },
  }
}

async function ollamaTags() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const data = await res.json()
    return (data.models || []).map((m) => m.name)
  } catch {
    return null
  }
}

async function validateOpencodeModel(model) {
  if (!model.startsWith('ollama/')) return { ok: true }
  const name = model.slice('ollama/'.length)
  const tags = await ollamaTags()
  if (!tags) {
    return { ok: false, message: `Ollama не отвечает на ${OLLAMA_URL} — модель не проверить` }
  }
  if (tags.includes(name) || name.endsWith('-cloud')) return { ok: true }
  return {
    ok: false,
    message: `в Ollama нет модели «${name}». Проверьте: ollama list (или ollama pull)`,
  }
}

function mergeOpencodeConfig(p, existing) {
  const base = baseOpencodeConfig()
  const cfg = existing && typeof existing === 'object' ? existing : base

  cfg.$schema = cfg.$schema || base.$schema
  cfg.providers = cfg.providers || {}
  cfg.providers.ollama = cfg.providers.ollama || {}
  cfg.providers.ollama.models = {
    ...base.providers.ollama.models,
    ...(cfg.providers.ollama.models || {}),
  }
  cfg.agents = { ...base.agents, ...(cfg.agents || {}) }
  cfg.model = p.opencode.model
  cfg.default_agent = p.opencode.agent
  return cfg
}

async function applyOpencode(p) {
  if (existsSync(OPENCODE_JSONC) && !existsSync(OPENCODE_FILE)) {
    warn(`✗ Найден ${OPENCODE_JSONC}, а не opencode.json.`)
    warn('  Скрипт не правит .jsonc, чтобы не потерять комментарии.')
    warn('  Перенесите настройки вручную или переименуйте файл в opencode.json.')
    return false
  }

  let existing = null
  if (existsSync(OPENCODE_FILE)) {
    try {
      existing = JSON.parse(readFileSync(OPENCODE_FILE, 'utf8'))
    } catch (err) {
      warn(`✗ ${OPENCODE_FILE} не разбирается как JSON: ${err.message}`)
      return false
    }
  }

  const next = mergeOpencodeConfig(p, existing)
  const payload = `${JSON.stringify(next, null, 2)}\n`
  const before = existing ? readFileSync(OPENCODE_FILE, 'utf8') : ''
  const changed = payload !== before

  log(`\nOpenCode: ${path.relative(ROOT, OPENCODE_FILE)}`)
  log(`  model          = ${next.model}`)
  log(`  default_agent  = ${next.default_agent}`)
  if (!changed) {
    log('  изменений нет')
    return true
  }
  if (dryRun) {
    log('  --dry-run: не записано')
    return true
  }

  if (existsSync(OPENCODE_FILE)) {
    copyFileSync(OPENCODE_FILE, `${OPENCODE_FILE}.bak-${STAMP}`)
    log(`  бэкап: opencode.json.bak-${STAMP}`)
  }
  writeFileSync(OPENCODE_FILE, payload, 'utf8')
  log('  записано')
  return true
}

function isVsCodeRunning() {
  if (process.platform !== 'win32') return false
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Code.exe', '/NH'], {
      encoding: 'utf8',
      timeout: 5000,
    })
    return /Code\.exe/i.test(out)
  } catch {
    return false
  }
}

async function openClineDb() {
  if (!existsSync(CLINE_DB)) {
    warn(`\nCline: не найден state.vscdb: ${CLINE_DB}`)
    warn('  Похоже, VS Code с расширением Cline ещё не запускался на этой машине.')
    return null
  }
  try {
    const { DatabaseSync } = await import('node:sqlite')
    return new DatabaseSync(CLINE_DB)
  } catch (err) {
    warn(`\nCline: node:sqlite недоступен (${err.message}).`)
    warn('  Нужен Node.js 22.5+ (в репозитории используется C:\\laragon\\bin\\nodejs\\node-v22).')
    return null
  }
}

function readCline(db) {
  const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(CLINE_KEY)
  if (row?.value == null) return {}
  const text = row.value instanceof Uint8Array ? Buffer.from(row.value).toString('utf8') : String(row.value)
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function clinePatch(p) {
  const patch = {
    welcomeViewCompleted: true,
    apiProvider: p.cline.provider,
    apiModelId: p.cline.model,
    planModeApiProvider: p.cline.provider,
    actModeApiProvider: p.cline.provider,
    planModeApiModelId: p.cline.model,
    actModeApiModelId: p.cline.model,
    planActSeparateModelsSetting: false,
  }
  if (p.cline.provider === 'ollama') {
    Object.assign(patch, {
      ollamaModelId: p.cline.model,
      ollamaBaseUrl: p.cline.baseUrl,
      ollamaApiOptionsCtxNum: String(p.cline.ctx),
      planModeOllamaModelId: p.cline.model,
      actModeOllamaModelId: p.cline.model,
    })
  }
  return patch
}

async function applyCline(p) {
  const db = await openClineDb()
  if (!db) return false
  try {
    const current = readCline(db)
    const patch = clinePatch(p)
    const keys = Object.keys(patch)
    const changed = keys.some((k) => JSON.stringify(current[k]) !== JSON.stringify(patch[k]))

    log('\nCline:')
    for (const k of keys) {
      const before = current[k] === undefined ? '—' : String(current[k])
      const after = String(patch[k])
      log(`  ${before === after ? '=' : '~'} ${k}: ${before} → ${after}`)
    }

    if (!changed) {
      log('  изменений нет')
      db.close()
      return true
    }
    if (dryRun) {
      log('  --dry-run: не записано')
      db.close()
      return true
    }
    if (isVsCodeRunning() && !force) {
      warn('\n✗ VS Code запущен: настройки Cline не записаны.')
      warn('  Закройте VS Code и повторите команду (Cline читает состояние при старте).')
      warn('  Принудительно: добавьте --force (VS Code может перезаписать настройки при выходе).')
      db.close()
      return false
    }

    db.exec('PRAGMA busy_timeout = 5000')
    copyFileSync(CLINE_DB, `${CLINE_DB}.bak-${STAMP}`)
    log(`  бэкап: state.vscdb.bak-${STAMP}`)

    const next = { ...current, ...patch }
    const payload = JSON.stringify(next)
    db.exec('BEGIN IMMEDIATE')
    try {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(CLINE_KEY)
      const value = row?.value instanceof Uint8Array ? Buffer.from(payload, 'utf8') : payload
      if (row) db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(value, CLINE_KEY)
      else db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(CLINE_KEY, value)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    log('  записано')
    db.close()
    return true
  } catch (err) {
    try {
      db.close()
    } catch {
      // база уже закрыта или недоступна — нечего сообщать
    }
    warn(`\n✗ Cline не обновлён: ${err.message}`)
    return false
  }
}

async function status() {
  log(`Репозиторий: ${ROOT}`)
  log(`Ollama:      ${OLLAMA_URL}`)

  const tags = await ollamaTags()
  if (tags) log(`             локальных моделей: ${tags.length}`)
  else warn('             ✗ Ollama не отвечает (запустите: ollama serve)')

  if (existsSync(OPENCODE_FILE)) {
    try {
      const cfg = JSON.parse(readFileSync(OPENCODE_FILE, 'utf8'))
      log(`\nOpenCode: ${path.relative(ROOT, OPENCODE_FILE)}`)
      log(`  model         = ${cfg.model || '—'}`)
      log(`  default_agent = ${cfg.default_agent || '—'}`)
    } catch {
      warn(`\nOpenCode: ${path.relative(ROOT, OPENCODE_FILE)} не разбирается как JSON`)
    }
  } else {
    log('\nOpenCode: opencode.json нет (профиль ещё не применялся)')
  }

  const db = await openClineDb()
  if (db) {
    try {
      const cur = readCline(db)
      log('\nCline (VS Code globalState):')
      log(`  apiProvider = ${cur.apiProvider || '—'}`)
      log(`  model       = ${cur.ollamaModelId || cur.apiModelId || '—'}`)
      log(`  baseUrl     = ${cur.ollamaBaseUrl || '—'}`)
      log(`  ctx         = ${cur.ollamaApiOptionsCtxNum || '—'}`)
      log(`  VS Code запущен: ${isVsCodeRunning() ? 'да (настройки Cline менять нельзя)' : 'нет'}`)
    } finally {
      db.close()
    }
  }
}

async function main() {
  if (flags.has('--help') || command === 'help') {
    usage()
    return 0
  }
  if (command === 'status') {
    await status()
    return 0
  }

  const profile = PROFILES[command]
  if (!profile) {
    warn(`✗ Неизвестный профиль: ${command}`)
    usage()
    return 1
  }

  log(`Профиль: ${command} — ${profile.title}`)
  if (dryRun) log('Режим: --dry-run (ничего не записывается)')

  let ok = true
  if (wantsOpencode) {
    const check = await validateOpencodeModel(profile.opencode.model)
    if (!check.ok) warn(`⚠ ${check.message}`)
    ok = (await applyOpencode(profile)) && ok
  }
  if (wantsCline) {
    ok = (await applyCline(profile)) && ok
  }

  if (ok) {
    log('\nГотово.')
    if (wantsOpencode) {
      log('OpenCode: конфиг подхватывается сам; уже открытая сессия модель не меняет —')
      log('          выберите модель в /models или начните новую сессию.')
    }
    if (wantsCline) {
      log('Cline:    перезапустите VS Code, затем проверьте шестерёнку → API Configuration.')
      if (profile.opencode.agent === 'cloud') {
        log('          Авто-одобрение записи и команд в облачном режиме держите выключенным.')
      }
    }
  }
  return ok ? 0 : 1
}

process.exitCode = await main()
