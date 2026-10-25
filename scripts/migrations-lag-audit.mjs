// Гейт «migrations-lag» (пункт 3 «Перенос из SwiftMatch», «Что-доделать.txt»).
//
// Проблема, которую он закрывает: миграция, которую никто не применяет, ничем не
// отличается от применённой — БД просто остаётся без своей таблицы, а ошибка
// всплывает 500-й на первом же запросе. В этом репозитории был ровно такой
// дефект: пять файлов `server/migrations/*.sql` лежали рядом с knex-миграциями,
// но `knexfile.js` объявляет `migrations.extension = 'js'`, поэтому knex их не
// видел — `npm run migrate` их не выполнял, seed.sql соответствующие объекты не
// создавал, а колонки добавлял только `test-db-setup.js` (то есть лишь в тестовой
// БД). Тесты при этом были зелёными, потому что их файлы мокают сервис, а не ходят
// в реальные таблицы.
//
// Что проверяет:
//   1. **Статически (без БД, работает где угодно).** Каждый файл в
//      `server/migrations/` имеет расширение, которое knex действительно
//      подхватывает (из `knexfile.js`: `extension` / `loadExtensions`). Файл с
//      чужим расширением (`*.sql`) = FAIL: он никогда не применится. Плюс запрет
//      одного и того же имени с разными расширениями (knex возьмёт одно, второе
//      молча потеряется) и защита от «проверки пустоты» (каталог без миграций).
//   2. **На живой БД.** Список файлов на диске сверяется с таблицей
//      `knex_migrations`: файл, которого нет в таблице, — это отставание (lag);
//      запись в таблице без файла — это дрейф (drift). Обе ситуации = FAIL.
//   3. **Режим `--setup`.** Поднимает временную БД, прогоняет `knex.migrate:latest`
//      на пустой базе и сверяет результат — то есть проверяет, что свежая выкладка
//      действительно получает все объекты (это и есть «живой» сценарий деплоя).
//   4. **Покрытие моделей prisma (на живой БД).** Каждая модель из
//      `server/prisma/schema.prisma` обязана иметь одноимённую таблицу после
//      применения миграций. Ровно этого не хватало CON-02: таблицы
//      `custom_field_definitions`/`custom_field_values` создавал только
//      standalone-скрипт и тест-харнесс, поэтому свежая БД их не получала, а
//      `GET /api/admin/custom-fields` отвечал 500. Пустой список моделей — тоже
//      FAIL (разбор сломался — значит проверять нечего, а не «всё хорошо»).
//
// Режимы:
//   node scripts/migrations-lag-audit.mjs              — статика + живая БД из env (DB_NAME)
//   node scripts/migrations-lag-audit.mjs --setup      — статика + временная БД: migrate:latest → сверка
//   node scripts/migrations-lag-audit.mjs --offline    — только статика (применённое состояние НЕ проверено)
//
// Живой режим требует зависимостей из server/ (knex, mysql2). Если БД недоступна,
// это FAIL, а не пропуск: иначе гейт был бы «зелёным по построению». Для CI без
// БД осознанно выбирается `--offline`, и он это громко печатает.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const MIGRATIONS_DIR = 'server/migrations'
export const KNEXFILE = 'server/knexfile.js'
export const MIGRATION_TABLE = 'knex_migrations'
export const SETUP_DB_NAME = 'servicedesk_migrations_check'
export const PRISMA_SCHEMA = 'server/prisma/schema.prisma'
export const DOCKERFILE = 'server/Dockerfile'
export const COMPOSE_FILE = 'docker-compose.yml'
export const DOCKERIGNORE = 'server/.dockerignore'

/** Расширения, которые knex подхватывает по `server/knexfile.js`. */
export function parseKnexExtensions(knexfileText) {
  const extensions = new Set()
  const loadMatch = knexfileText.match(/loadExtensions\s*:\s*\[([^\]]*)\]/)
  if (loadMatch) {
    for (const m of loadMatch[1].matchAll(/['"]([^'"]+)['"]/g)) extensions.add(m[1])
  }
  const extMatch = knexfileText.match(/(?<![A-Za-z])extension\s*:\s*['"]([^'"]+)['"]/)
  if (extMatch) extensions.add(extMatch[1].startsWith('.') ? extMatch[1] : `.${extMatch[1]}`)
  if (extensions.size === 0) extensions.add('.js')
  return [...extensions]
}

/**
 * Модели prisma: строка `model Имя {`. Строки-комментарии (`// model …`) не
 * считаются — иначе гейт был бы зелёным от упоминания таблицы в комментарии.
 */
export function parsePrismaModels(prismaText) {
  const models = []
  for (const rawLine of prismaText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('//') || line.startsWith('///')) continue
    const m = /^model\s+([A-Za-z_]\w*)\s*\{/.exec(line)
    if (m) models.push(m[1])
  }
  return models
}

/**
 * Покрытие моделей таблицами. Принимает данные, а не читает их: тест гоняет
 * функцию без БД. Пустой список моделей — находка `vacuous`, а не «всё сошлось».
 */
export function auditModelCoverage({ models, tables, source = PRISMA_SCHEMA }) {
  const findings = []
  if (!models || models.length === 0) {
    findings.push({
      kind: 'vacuous',
      msg: `${source}: не разобрано ни одной модели — проверять покрытие нечем (сломался разбор, а не схема)`,
    })
    return { findings, stats: { models: 0, tables: tables ? tables.length : 0, missing: 0 } }
  }

  const present = new Set(tables || [])
  const missing = models.filter((model) => !present.has(model))
  for (const model of missing) {
    findings.push({
      kind: 'missing-table',
      msg: `${source}: модель ${model} не создаётся ни одной миграцией — таблицы ${model} нет в БД (первый запрос к ней даёт 500)`,
    })
  }

  return { findings, stats: { models: models.length, tables: present.size, missing: missing.length } }
}

/**
 * Фрагмент compose-сервиса по имени (от `  name:` до следующего сервиса или
 * top-level ключа). Нужен, чтобы не искать `migrate` по всему файлу: команда
 * миграций должна быть именно у сервиса, а ожидание — именно у api.
 */
export function extractComposeService(composeText, serviceName) {
  const lines = composeText.split(/\r?\n/)
  const start = lines.findIndex((line) => new RegExp(`^ {2}${serviceName}:\\s*$`).test(line))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_.-]+:\s*$/.test(lines[i])) {
      end = i
      break
    }
    if (/^\S/.test(lines[i]) && lines[i].trim() !== '') {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/**
 * Docker-обвязка миграций (RLS-06). Миграции, которые есть на диске, но не
 * попадают в образ и не запускаются перед API, ничем не отличаются от
 * отсутствующих: свежий контейнер поднимается на пустой схеме и отвечает 500.
 * Раньше схему в docker создавал `server/seed.sql` как initdb (устаревшая копия:
 * 14 таблиц против 45 моделей Prisma), а `server/Dockerfile` не копировал
 * `migrations/` — API стартовал без единой миграции.
 */
export function auditDockerWiring({
  dockerfileText,
  composeText,
  dockerignoreText,
  source = `${DOCKERFILE} + ${COMPOSE_FILE}`,
}) {
  const findings = []
  const add = (kind, msg) => findings.push({ kind, msg })

  if (!dockerfileText || !composeText) {
    add('vacuous', `${source}: не прочитаны Dockerfile или docker-compose.yml — проверять нечего`)
    return { findings, stats: { dockerfile: false, migrate: false, apiWaits: false, ignore: false } }
  }

  const compose = composeText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n')

  if (!/^COPY\s+.*\bmigrations\b/m.test(dockerfileText)) {
    add('docker-no-migrations', `${DOCKERFILE}: образ не копирует migrations/ — сервис миграций нечего накатывать`)
  }
  if (!/^COPY\s+.*\bknexfile\.js\b/m.test(dockerfileText)) {
    add('docker-no-knexfile', `${DOCKERFILE}: образ не копирует knexfile.js — migrate:latest не найдёт конфиг`)
  }

  const migrateBlock = extractComposeService(compose, 'migrate')
  const migrate = /(npm\W+run\W+migrate|knex\W+migrate:latest)/.test(migrateBlock)
  if (!migrate) {
    add('compose-no-migrate', `${COMPOSE_FILE}: нет сервиса migrate с командой наката миграций — свежая БД остаётся пустой`)
  }

  const apiBlock = extractComposeService(compose, 'api')
  const apiWaits =
    /depends_on:[\s\S]*?\bmigrate:[\s\S]*?condition:\s*service_completed_successfully/.test(apiBlock)
  if (!apiWaits) {
    add(
      'compose-api-not-waiting',
      `${COMPOSE_FILE}: api не ждёт завершения migrate (condition: service_completed_successfully) — стартует на недомигрированной схеме`,
    )
  }

  if (/docker-entrypoint-initdb\.d/.test(compose)) {
    add(
      'compose-seed-initdb',
      `${COMPOSE_FILE}: seed.sql монтируется как initdb — схема берётся из устаревшей копии, а не из миграций`,
    )
  }

  const dockerfile = /^COPY\s+.*\bmigrations\b/m.test(dockerfileText) && /^COPY\s+.*\bknexfile\.js\b/m.test(dockerfileText)

  const ignoreEntries = String(dockerignoreText || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^!/, '').replace(/\/+$/, ''))
    .filter((line) => line !== '' && !line.startsWith('#'))
  const ignore = ignoreEntries.includes('node_modules') && ignoreEntries.includes('logs')
  if (!dockerignoreText) {
    add(
      'dockerignore-missing',
      `${DOCKERIGNORE}: файла нет — в контекст сборки едут node_modules и logs (на этом репозитории 1.9 ГБ за первые две минуты, сборка не укладывается в таймаут)`,
    )
  } else if (!ignore) {
    add(
      'dockerignore-context',
      `${DOCKERIGNORE}: не исключены node_modules и logs — контекст сборки раздувается рантайм-данными, сборка образа деградирует до часов`,
    )
  }

  return { findings, stats: { dockerfile, migrate, apiWaits, ignore } }
}

/** Имя миграции для knex — имя файла без расширения. */
export function migrationName(fileName) {
  return fileName.replace(/\.[^.]+$/, '')
}

export function migrationExtension(fileName) {
  const idx = fileName.lastIndexOf('.')
  return idx === -1 ? '' : fileName.slice(idx)
}

/**
 * Статические проверки каталога миграций. Принимает данные, а не читает их —
 * так функция тестируется без файловой системы и без БД.
 */
export function auditMigrationFiles({ files, extensions }) {
  const findings = []
  const add = (kind, msg) => findings.push({ kind, msg })

  if (!files || files.length === 0) {
    add('vacuous', `${MIGRATIONS_DIR}: не найдено ни одного файла миграции — проверять нечего`)
    return { findings, stats: { files: 0, extra: 0 } }
  }

  const allowed = new Set(extensions)
  let extra = 0
  const byBase = new Map()

  for (const file of files) {
    const ext = migrationExtension(file)
    if (!allowed.has(ext)) {
      extra++
      add(
        'extension',
        `${MIGRATIONS_DIR}/${file}: расширение «${ext || '(нет)'}» не подхватывается knex (только ${[...allowed].join(', ')}) — эта миграция не применится никогда`,
      )
    }
    const base = migrationName(file)
    if (byBase.has(base)) {
      add('duplicate', `${MIGRATIONS_DIR}: имя «${base}» занято дважды (${byBase.get(base)}, ${file}) — одно из них молча потеряется`)
    } else {
      byBase.set(base, file)
    }
  }

  return { findings, stats: { files: files.length, extra } }
}

/** Сверка «файлы на диске ↔ knex_migrations». Чистая функция. */
export function auditMigrationState({ files, applied, extensions = ['.js'], tableExists = true }) {
  const findings = []
  const add = (kind, msg) => findings.push({ kind, msg })

  // knex пишет в knex_migrations.name имя файла целиком, вместе с расширением,
  // поэтому сравниваем полные имена, а не «базу» (иначе всё считается lag).
  const onDisk = new Map()
  for (const file of files) {
    if (extensions.includes(migrationExtension(file))) onDisk.set(file, file)
  }
  const appliedSet = new Set(applied)

  if (!tableExists) {
    add(
      'no-table',
      `в БД нет таблицы ${MIGRATION_TABLE}: миграции не накатывались вовсе (${files.length} файлов на диске ждут применения)`,
    )
    return { findings, stats: { files: files.length, applied: applied.length, lag: files.length, drift: 0 } }
  }

  const lag = []
  for (const file of onDisk.keys()) {
    if (!appliedSet.has(file)) lag.push(file)
  }
  const drift = applied.filter((name) => !onDisk.has(name))

  for (const file of lag) {
    add('lag', `${MIGRATIONS_DIR}/${file}: файл есть на диске, но его нет в ${MIGRATION_TABLE} — миграция не применена`)
  }
  for (const name of drift) {
    add('drift', `${MIGRATION_TABLE}: запись «${name}» без файла на диске — журнал применённых ссылается на несуществующую миграцию`)
  }

  return {
    findings,
    stats: { files: onDisk.size, applied: applied.length, lag: lag.length, drift: drift.length },
  }
}

export function listMigrationFiles() {
  return readdirSync(path.join(ROOT, MIGRATIONS_DIR))
    .filter((name) => !name.startsWith('.'))
    .sort()
}

function readSources() {
  return {
    knexfileText: readFileSync(path.join(ROOT, KNEXFILE), 'utf8'),
    prismaText: readFileSync(path.join(ROOT, PRISMA_SCHEMA), 'utf8'),
    dockerfileText: readFileSync(path.join(ROOT, DOCKERFILE), 'utf8'),
    composeText: readFileSync(path.join(ROOT, COMPOSE_FILE), 'utf8'),
    dockerignoreText: readFileSync(path.join(ROOT, DOCKERIGNORE), 'utf8'),
    files: listMigrationFiles(),
  }
}

async function runLive({ setup, dbName }) {
  const { readAppliedMigrations, createDatabase, dropDatabase, defaultDatabaseName } = await import(
    pathToFileURL(path.join(ROOT, 'server/migrations-lag.js')).href
  )
  const { knexfileText, prismaText } = readSources()
  const extensions = parseKnexExtensions(knexfileText)
  const files = listMigrationFiles()
  const models = parsePrismaModels(prismaText)

  const withCoverage = (state, tables, label) => {
    if (!state.stats || state.stats.applied === 0) {
      return { findings: state.findings, stats: { ...state.stats }, target: label }
    }
    const coverage = auditModelCoverage({ models, tables })
    return {
      findings: [...state.findings, ...coverage.findings],
      stats: { ...state.stats, ...coverage.stats },
      target: label,
    }
  }

  if (!setup) {
    const target = dbName || defaultDatabaseName()
    const { applied, tableExists, tables } = await readAppliedMigrations(target, { withTables: true })
    const state = auditMigrationState({ files, applied, extensions, tableExists })
    if (!tableExists) return { ...state, target }
    return withCoverage(state, tables, target)
  }

  const scratch = dbName || SETUP_DB_NAME
  await createDatabase(scratch)
  try {
    const { applied, tableExists, tables } = await readAppliedMigrations(scratch, { migrate: true, withTables: true })
    const state = auditMigrationState({ files, applied, extensions, tableExists })
    const label = `${scratch} (свежая БД, migrate:latest)`
    if (!tableExists) return { ...state, target: label }
    return withCoverage(state, tables, label)
  } finally {
    await dropDatabase(scratch)
  }
}

function printFindings(findings) {
  for (const f of findings) console.error(`✗ [${f.kind}] ${f.msg}`)
}

async function main() {
  const args = process.argv.slice(2)
  const offline = args.includes('--offline')
  const setup = args.includes('--setup')
  const dbArgIdx = args.indexOf('--db')
  const dbName = dbArgIdx === -1 ? null : args[dbArgIdx + 1]

  const { knexfileText, files, dockerfileText, composeText, dockerignoreText } = readSources()
  const extensions = parseKnexExtensions(knexfileText)

  console.log(`• ${KNEXFILE}: knex подхватывает ${extensions.join(', ')}; файлов в ${MIGRATIONS_DIR}: ${files.length}`)

  const staticResult = auditMigrationFiles({ files, extensions })
  const dockerResult = auditDockerWiring({ dockerfileText, composeText, dockerignoreText })
  console.log(
    `• Docker: образ копирует migrations/knexfile — ${dockerResult.stats.dockerfile ? 'да' : 'нет'}; ` +
      `сервис migrate — ${dockerResult.stats.migrate ? 'да' : 'нет'}; api ждёт migrate — ${dockerResult.stats.apiWaits ? 'да' : 'нет'}; ` +
      `.dockerignore без node_modules/logs — ${dockerResult.stats.ignore ? 'да' : 'нет'}`,
  )
  let findings = [...staticResult.findings, ...dockerResult.findings]
  let live = null

  if (!offline) {
    try {
      live = await runLive({ setup, dbName })
      findings = findings.concat(live.findings)
    } catch (err) {
      findings.push({
        kind: 'db-unreachable',
        msg: `живая сверка не выполнена (${err.code || err.message}). Это FAIL, а не пропуск: запустите с рабочей БД или осознанно с --offline`,
      })
    }
  }

  if (live) {
    console.log(
      `• БД ${live.target}: применено ${live.stats.applied} из ${live.stats.files} файлов (lag ${live.stats.lag}, drift ${live.stats.drift})`,
    )
    if (live.stats.models) {
      console.log(
        `• покрытие моделей prisma: ${live.stats.models} моделей, ${live.stats.tables} таблиц, без таблицы ${live.stats.missing}`,
      )
    }
  } else if (offline) {
    console.log('• статический режим (--offline): применённое состояние БД и покрытие моделей prisma НЕ проверены')
  }

  if (findings.length > 0) {
    printFindings(findings)
    console.error(`\nИтог: FAIL — миграции расходятся с диском или с knex_migrations (${findings.length} находок).`)
    process.exit(1)
  }

  const coverageNote = live && live.stats.models ? `, модели prisma покрыты таблицами (${live.stats.models})` : ''
  console.log(
    `\nИтог: миграции целостны (${files.length} файлов, все применимы${live ? ' и применены' : ''}${coverageNote}) ✓`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
