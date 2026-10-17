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
    files: listMigrationFiles(),
  }
}

async function runLive({ setup, dbName }) {
  const { readAppliedMigrations, createDatabase, dropDatabase, defaultDatabaseName } = await import(
    pathToFileURL(path.join(ROOT, 'server/migrations-lag.js')).href
  )
  const extensions = parseKnexExtensions(readSources().knexfileText)
  const files = listMigrationFiles()

  if (!setup) {
    const target = dbName || defaultDatabaseName()
    const { applied, tableExists } = await readAppliedMigrations(target)
    const state = auditMigrationState({ files, applied, extensions, tableExists })
    return { ...state, target }
  }

  const scratch = dbName || SETUP_DB_NAME
  await createDatabase(scratch)
  try {
    const { applied, tableExists } = await readAppliedMigrations(scratch, { migrate: true })
    const state = auditMigrationState({ files, applied, extensions, tableExists })
    return { ...state, target: `${scratch} (свежая БД, migrate:latest)` }
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

  const { knexfileText, files } = readSources()
  const extensions = parseKnexExtensions(knexfileText)

  console.log(`• ${KNEXFILE}: knex подхватывает ${extensions.join(', ')}; файлов в ${MIGRATIONS_DIR}: ${files.length}`)

  const staticResult = auditMigrationFiles({ files, extensions })
  let findings = [...staticResult.findings]
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
  } else if (offline) {
    console.log('• статический режим (--offline): применённое состояние БД НЕ проверено')
  }

  if (findings.length > 0) {
    printFindings(findings)
    console.error(`\nИтог: FAIL — миграции расходятся с диском или с knex_migrations (${findings.length} находок).`)
    process.exit(1)
  }

  console.log(`\nИтог: миграции целостны (${files.length} файлов, все применимы${live ? ' и применены' : ''}) ✓`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
