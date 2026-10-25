/**
 * Гейт «схема Prisma ↔ свежая БД из миграций» (schema-drift).
 *
 * Prisma Client строит запросы по `server/prisma/schema.prisma`, а таблицы и
 * колонки создаёт knex-миграции. Пока эти два источника расходятся, моки тестов
 * зелёные (они принимают любые аргументы), а живая БД отвечает 500:
 *
 *   - `tickets.status/priority/category` и `chat_rooms.type` создавались как
 *     ENUM (`server/migrations/20260702_000001_create_all_tables.js:8,23-25`),
 *     хотя Prisma объявляет String (`server/prisma/schema.prisma:65-67`). Код
 *     пишет `reopened` и `waiting_for_customer`
 *     (`server/src/services/tickets.service.js:23-28`), кнопка «Переоткрыть»
 *     отправляет `reopened` (`src/pages/Tickets.tsx:422`) — MySQL отвечал
 *     WARN_DATA_TRUNCATED, пользователь видел 500.
 *   - `employees.role` был VARCHAR(10), а роль `super_admin` — 11 символов.
 *   - `tickets.email_message_id` использовался в
 *     `server/src/services/email-ingestion.service.js:68,144,152`, но не был
 *     объявлен ни в Prisma, ни в миграциях: PrismaClientValidationError до
 *     обращения к БД.
 *   - `server/test-db-setup.js` сам правил схему после миграций (ALTER TABLE,
 *     addColumnIfNotExists), поэтому тестовая БД не воспроизводила прод.
 *
 * Что проверяет:
 *   1. **Статически (без БД).** Prisma-схема разбирается и не пуста; каждая
 *      модель создаётся миграцией (`createTable` или raw `CREATE TABLE`);
 *      `seed.sql` (initdb для docker, `docker-compose.yml:16`) не объявляет
 *      колонок, которых нет в Prisma, и не расходится по типу; тест-харнесс не
 *      правит схему после миграций.
 *   2. **На живой БД (`--setup`).** Временная БД собирается только миграциями,
 *      затем каждая скалярная колонка Prisma сверяется с information_schema:
 *      нет таблицы/колонки, ENUM вместо String, короткий VARCHAR, несовместимое
 *      семейство типов.
 *
 * Nullability измеряется, но в гейт не входит: Prisma `optional` при DB NOT NULL
 * — это более широкий контракт кода, а не дрейф схемы; такие расхождения
 * печатаются предупреждением.
 *
 * Режимы:
 *   node scripts/schema-drift-audit.mjs              — статика + живая БД из env (DB_NAME)
 *   node scripts/schema-drift-audit.mjs --setup      — статика + временная БД: migrate:latest → сверка
 *   node scripts/schema-drift-audit.mjs --offline    — только статика (живое состояние НЕ проверено)
 *
 * Живой режим требует зависимостей из server/ (knex, mysql2). Недоступная БД —
 * это FAIL, а не пропуск: иначе гейт был бы зелёным по построению.
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const PRISMA_SCHEMA = 'server/prisma/schema.prisma'
export const SEED_SQL = 'server/seed.sql'
export const MIGRATIONS_DIR = 'server/migrations'
export const TEST_DB_SETUP = 'server/test-db-setup.js'
export const SETUP_DB_NAME = 'servicedesk_schema_drift'

const INT_TYPES = new Set(['int', 'bigint', 'smallint', 'tinyint', 'mediumint'])
const STRING_TYPES = new Set(['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext', 'enum', 'set'])
const DATETIME_TYPES = new Set(['datetime', 'timestamp', 'date', 'time', 'year'])
const FLOAT_TYPES = new Set(['float', 'double', 'decimal'])

function familyOf(dataType) {
  const type = String(dataType || '').toLowerCase()
  if (INT_TYPES.has(type) || type === 'bit' || type === 'boolean') return 'int'
  if (STRING_TYPES.has(type)) return 'string'
  if (DATETIME_TYPES.has(type)) return 'datetime'
  if (type === 'json') return 'json'
  if (FLOAT_TYPES.has(type)) return 'float'
  return type
}

function prismaFamily(type) {
  if (type === 'Int' || type === 'BigInt' || type === 'Boolean') return 'int'
  if (type === 'String') return 'string'
  if (type === 'DateTime') return 'datetime'
  if (type === 'Json') return 'json'
  if (type === 'Float' || type === 'Decimal') return 'float'
  return 'other'
}

function varcharLength(columnType) {
  const match = /(?:var)?char\((\d+)\)/i.exec(String(columnType || ''))
  return match ? Number(match[1]) : 0
}

/**
 * Разбор `schema.prisma`: модели, имена таблиц (`@@map`), скалярные поля.
 * Relation-поля пропускаются: списки (`events events[]`), обратные ссылки по
 * имени модели и поля с `@relation` — у них нет одноимённой колонки.
 */
export function parsePrismaSchema(text) {
  const models = []
  let current = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('//') || line.startsWith('///')) continue

    const modelMatch = /^model\s+([A-Za-z_]\w*)\s*\{/.exec(line)
    if (modelMatch) {
      current = { name: modelMatch[1], table: modelMatch[1], fields: [] }
      models.push(current)
      continue
    }
    if (current && line === '}') {
      current = null
      continue
    }
    if (!current) continue

    const mapMatch = /^@@map\("([^"]+)"\)/.exec(line)
    if (mapMatch) {
      current.table = mapMatch[1]
      continue
    }
    if (line.startsWith('@@')) continue

    const fieldMatch = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\[\])?(\?)?(?:\s+(.*))?$/.exec(line)
    if (!fieldMatch) continue

    const attrs = fieldMatch[5] || ''
    const dbTypeMatch = /@db\.(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/.exec(attrs)
    current.fields.push({
      name: fieldMatch[1],
      type: fieldMatch[2],
      list: Boolean(fieldMatch[3]),
      optional: Boolean(fieldMatch[4]),
      dbType: dbTypeMatch
        ? {
            name: dbTypeMatch[1],
            length: dbTypeMatch[2] ? Number(dbTypeMatch[2]) : null,
            scale: dbTypeMatch[3] ? Number(dbTypeMatch[3]) : null,
          }
        : null,
      isRelation: /@relation\b/.test(attrs),
    })
  }

  const modelNames = new Set(models.map((model) => model.name))
  for (const model of models) {
    model.fields = model.fields.filter(
      (field) => !field.isRelation && !field.list && !modelNames.has(field.type),
    )
  }
  return models
}

/**
 * Разбор `seed.sql`: `CREATE TABLE [IF NOT EXISTS]` и объявленные колонки.
 * Строки PRIMARY/FOREIGN/UNIQUE/KEY/INDEX/CONSTRAINT/CHECK — не колонки.
 */
export function parseSeedTables(text) {
  const tables = new Map()
  let current = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!current) {
      const create = /^CREATE TABLE (?:IF NOT EXISTS )?`?([A-Za-z_]\w*)`?\s*\(/i.exec(line)
      if (create) {
        current = { name: create[1], columns: new Map() }
        tables.set(current.name, current)
      }
      continue
    }

    if (/^\)[^;]*;/.test(line)) {
      current = null
      continue
    }
    if (/^(PRIMARY|FOREIGN|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK)\b/i.test(line)) continue

    const column = /^`?([A-Za-z_]\w*)`?\s+([A-Za-z]+)(?:\(([^)]*)\))?/i.exec(line)
    if (!column) continue
    current.columns.set(column[1], {
      type: column[2].toUpperCase(),
      args: column[3] || '',
    })
  }
  return tables
}

/** Имена таблиц, которые создаёт хотя бы одна миграция (knex или raw SQL). */
export function parseMigrationTables(text) {
  const created = new Set()
  for (const match of text.matchAll(/createTable(?:IfNotExists)?\(\s*['"`]([A-Za-z_]\w*)['"`]/g)) {
    created.add(match[1])
  }
  for (const match of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?\\?`?([A-Za-z_]\w*)/gi)) {
    created.add(match[1])
  }
  return created
}

export function stripJsComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Статические находки по Prisma-схеме: пустой разбор и модель без скалярных
 * полей — это сломанный парсер, а не «всё хорошо».
 */
export function auditPrisma({ models, source = PRISMA_SCHEMA }) {
  const findings = []
  if (!models || models.length === 0) {
    findings.push({
      kind: 'vacuous',
      msg: `${source}: не разобрано ни одной модели — проверять нечего (сломался разбор, а не схема)`,
    })
    return { findings, stats: { models: 0, fields: 0 } }
  }

  const seen = new Map()
  let fields = 0
  for (const model of models) {
    if (seen.has(model.table)) {
      findings.push({
        kind: 'duplicate-table',
        msg: `${source}: таблица «${model.table}» объявлена дважды (${seen.get(model.table)}, ${model.name})`,
      })
    } else {
      seen.set(model.table, model.name)
    }
    fields += model.fields.length
    if (model.fields.length === 0) {
      findings.push({
        kind: 'model-no-fields',
        msg: `${source}: у модели ${model.name} нет скалярных полей — разбор схемы сломан`,
      })
    }
  }
  return { findings, stats: { models: models.length, fields } }
}

/**
 * Сверка Prisma с живой схемой. Принимает данные, а не читает БД: тест гоняет
 * функцию без MySQL.
 */
export function auditSchema({ models, tables, columns, source = 'БД' }) {
  const findings = []
  const warnings = []
  if (!models || models.length === 0) {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: не разобрано ни одной модели — сверять нечего` }],
      warnings,
      stats: { models: 0, tables: 0, columns: 0, fields: 0 },
    }
  }
  if (!columns || columns.length === 0) {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: не прочитано ни одной колонки — сверять нечего` }],
      warnings,
      stats: { models: models.length, tables: 0, columns: 0, fields: 0 },
    }
  }

  const tableSet = new Set(tables || columns.map((column) => column.table))
  const byTable = new Map()
  for (const column of columns) {
    if (!byTable.has(column.table)) byTable.set(column.table, new Map())
    byTable.get(column.table).set(column.name, column)
  }

  let fields = 0
  for (const model of models) {
    if (!tableSet.has(model.table)) {
      findings.push({
        kind: 'missing-table',
        msg: `${source}: модели ${model.name} нет таблицы «${model.table}» — первый запрос к ней даёт 500`,
      })
      continue
    }
    const tableColumns = byTable.get(model.table)
    for (const field of model.fields) {
      fields++
      const column = tableColumns.get(field.name)
      if (!column) {
        findings.push({
          kind: 'missing-column',
          msg: `${source}: ${model.table}.${field.name} (Prisma ${field.type}) отсутствует в БД — PrismaClientValidationError до запроса`,
        })
        continue
      }

      const typeFinding = auditFieldType({ model, field, column, source })
      if (typeFinding) findings.push(typeFinding)

      if (field.optional && !column.nullable) {
        warnings.push(`${model.table}.${field.name}: Prisma optional → DB NOT NULL (${column.columnType})`)
      }
    }
  }

  return {
    findings,
    warnings,
    stats: { models: models.length, tables: tableSet.size, columns: columns.length, fields },
  }
}

function auditFieldType({ model, field, column, source }) {
  const dbType = String(column.dataType || '').toLowerCase()
  const want = prismaFamily(field.type)
  if (want === 'other') return null

  if (dbType === 'enum') {
    if (field.type === 'String') {
      return {
        kind: 'enum-column',
        msg: `${source}: ${model.table}.${field.name} — Prisma String, а в БД ${column.columnType}: значение вне ENUM даёт WARN_DATA_TRUNCATED (500)`,
      }
    }
    return {
      kind: 'type-family',
      msg: `${source}: ${model.table}.${field.name} — Prisma ${field.type}, а в БД ${column.columnType}`,
    }
  }

  if (want !== familyOf(dbType)) {
    return {
      kind: 'type-family',
      msg: `${source}: ${model.table}.${field.name} — Prisma ${field.type}, а в БД ${column.columnType}`,
    }
  }

  if (field.type === 'String') {
    const declared = field.dbType
    if (declared?.name === 'VarChar' && declared.length && dbType === 'varchar') {
      const actual = varcharLength(column.columnType)
      if (actual > 0 && actual < declared.length) {
        return {
          kind: 'short-varchar',
          msg: `${source}: ${model.table}.${field.name} — Prisma VarChar(${declared.length}), а в БД ${column.columnType}: длинное значение усечётся`,
        }
      }
    }
    if (['Text', 'MediumText', 'LongText'].includes(declared?.name) && dbType === 'varchar') {
      return {
        kind: 'short-varchar',
        msg: `${source}: ${model.table}.${field.name} — Prisma ${declared.name}, а в БД ${column.columnType}: длинное значение усечётся`,
      }
    }
  }

  return null
}

/**
 * `seed.sql` — initdb для docker (`docker-compose.yml:16`), то есть вторая копия
 * схемы. Проверяются только таблицы, которые он создаёт: покрытие колонок у него
 * частичное, его закрывает живая сверка миграций. Лишняя колонка (её нет в
 * Prisma) и расхождение типа — находки.
 */
export function auditSeed({ models, seedTables, source = SEED_SQL }) {
  const findings = []
  if (!models || models.length === 0) {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: не разобрано ни одной модели — сверять нечего` }],
      stats: { tables: 0, columns: 0, checked: 0 },
    }
  }
  if (!seedTables || seedTables.size === 0) {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: не разобрано ни одной таблицы — проверять нечего` }],
      stats: { tables: 0, columns: 0, checked: 0 },
    }
  }

  const byTable = new Map(models.map((model) => [model.table, model]))
  let columns = 0
  let checked = 0

  for (const [tableName, table] of seedTables) {
    const model = byTable.get(tableName)
    if (!model) {
      findings.push({
        kind: 'seed-unknown-table',
        msg: `${source}: таблица «${tableName}» есть в seed.sql, но её нет в Prisma`,
      })
      continue
    }
    const fields = new Map(model.fields.map((field) => [field.name, field]))
    for (const [columnName, column] of table.columns) {
      columns++
      const field = fields.get(columnName)
      if (!field) {
        findings.push({
          kind: 'seed-extra-column',
          msg: `${source}: ${tableName}.${columnName} есть в seed.sql, но отсутствует в Prisma`,
        })
        continue
      }
      checked++
      const typeFinding = auditFieldType({
        model,
        field,
        column: {
          dataType: column.type.toLowerCase(),
          columnType: `${column.type}(${column.args})`.replace(/\(\)$/, ''),
        },
        source,
      })
      if (typeFinding) findings.push(typeFinding)
    }
  }

  return { findings, stats: { tables: seedTables.size, columns, checked } }
}

/**
 * Каждая модель Prisma обязана создаваться миграцией: иначе свежая БД (и Docker,
 * где API миграции не накатывает) останется без таблицы.
 */
export function auditMigrationCoverage({ models, migrationText, source = MIGRATIONS_DIR }) {
  if (!models || models.length === 0) {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: не разобрано ни одной модели — сверять нечего` }],
      stats: { created: 0, missing: 0 },
    }
  }
  const created = parseMigrationTables(migrationText || '')
  if (created.size === 0) {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: не найдено ни одного CREATE TABLE — проверять нечего` }],
      stats: { created: 0, missing: 0 },
    }
  }

  const findings = []
  let missing = 0
  for (const model of models) {
    if (!created.has(model.table)) {
      missing++
      findings.push({
        kind: 'no-create-table',
        msg: `${source}: модель ${model.name} не создаётся ни одной миграцией — таблицы «${model.table}» не будет на свежей БД`,
      })
    }
  }
  return { findings, stats: { created: created.size, missing } }
}

/**
 * Тест-харнесс не имеет права править схему после миграций: именно эти заплатки
 * (`ALTER TABLE`, `addColumnIfNotExists`) маскировали дрейф — тестовая БД
 * отличалась от прод-схемы, а тесты оставались зелёными.
 */
export function auditHarness({ text, source = TEST_DB_SETUP }) {
  if (!text || text.trim() === '') {
    return {
      findings: [{ kind: 'vacuous', msg: `${source}: файл пуст — проверять нечего` }],
      stats: { patches: 0 },
    }
  }
  const code = stripJsComments(text)
  const patches = []
  if (/\bALTER\s+TABLE\b/i.test(code)) patches.push('ALTER TABLE')
  if (/\baddColumnIfNotExists\b/.test(code)) patches.push('addColumnIfNotExists')
  if (/\bCREATE\s+TABLE\b/i.test(code)) patches.push('CREATE TABLE')

  const findings = patches.map((patch) => ({
    kind: 'harness-patch',
    msg: `${source}: тест-харнесс правит схему после миграций (${patch}) — тестовая БД перестаёт воспроизводить прод, дрейф маскируется`,
  }))
  return { findings, stats: { patches: patches.length } }
}

function readSources() {
  return {
    prismaText: readFileSync(path.join(ROOT, PRISMA_SCHEMA), 'utf8'),
    seedText: readFileSync(path.join(ROOT, SEED_SQL), 'utf8'),
    harnessText: readFileSync(path.join(ROOT, TEST_DB_SETUP), 'utf8'),
    migrationText: readdirSync(path.join(ROOT, MIGRATIONS_DIR))
      .filter((name) => name.endsWith('.js') && !name.startsWith('.'))
      .sort()
      .map((name) => readFileSync(path.join(ROOT, MIGRATIONS_DIR, name), 'utf8'))
      .join('\n'),
  }
}

async function runLive({ setup, dbName, models }) {
  const { readSchema } = await import(pathToFileURL(path.join(ROOT, 'server/schema-drift.js')).href)
  const { createDatabase, dropDatabase, defaultDatabaseName } = await import(
    pathToFileURL(path.join(ROOT, 'server/migrations-lag.js')).href
  )

  if (!setup) {
    const target = dbName || defaultDatabaseName()
    const schema = await readSchema(target)
    return { ...auditSchema({ models, ...schema, source: target }), target }
  }

  const scratch = dbName || SETUP_DB_NAME
  await createDatabase(scratch)
  try {
    const schema = await readSchema(scratch, { migrate: true })
    return {
      ...auditSchema({ models, ...schema, source: `${scratch} (свежая БД, migrate:latest)` }),
      target: `${scratch} (свежая БД, migrate:latest)`,
    }
  } finally {
    await dropDatabase(scratch)
  }
}

function printFindings(findings) {
  for (const finding of findings) console.error(`✗ [${finding.kind}] ${finding.msg}`)
}

async function main() {
  const args = process.argv.slice(2)
  const offline = args.includes('--offline')
  const setup = args.includes('--setup')
  const dbArgIdx = args.indexOf('--db')
  const dbName = dbArgIdx === -1 ? null : args[dbArgIdx + 1]

  const { prismaText, seedText, harnessText, migrationText } = readSources()
  const models = parsePrismaSchema(prismaText)

  const prismaAudit = auditPrisma({ models })
  const migrationAudit = auditMigrationCoverage({ models, migrationText })
  const seedAudit = auditSeed({ models, seedTables: parseSeedTables(seedText) })
  const harnessAudit = auditHarness({ text: harnessText })

  let findings = [
    ...prismaAudit.findings,
    ...migrationAudit.findings,
    ...seedAudit.findings,
    ...harnessAudit.findings,
  ]

  console.log(
    `• Prisma: ${prismaAudit.stats.models} моделей, ${prismaAudit.stats.fields} скалярных полей; ` +
      `миграции создают ${migrationAudit.stats.created} таблиц; seed.sql — ${seedAudit.stats.tables} таблиц`,
  )

  let live = null
  let warnings = []
  if (!offline) {
    try {
      live = await runLive({ setup, dbName, models })
      findings = findings.concat(live.findings)
      warnings = live.warnings
    } catch (error) {
      findings.push({
        kind: 'db-unreachable',
        msg: `живая сверка не выполнена (${error.code || error.message}). Это FAIL, а не пропуск: запустите с рабочей БД или осознанно с --offline`,
      })
    }
  }

  if (live) {
    console.log(
      `• БД ${live.target}: ${live.stats.tables} таблиц, ${live.stats.columns} колонок; сверено полей: ${live.stats.fields}`,
    )
    if (warnings.length > 0) {
      console.log(`⚠ nullability: ${warnings.length} расхождений (Prisma optional → DB NOT NULL), в гейт не входят`)
      for (const warning of warnings.slice(0, 10)) console.log(`  · ${warning}`)
      if (warnings.length > 10) console.log(`  · … ещё ${warnings.length - 10}`)
    }
  } else if (offline) {
    console.log('• статический режим (--offline): живая схема БД НЕ проверена')
  }

  if (findings.length > 0) {
    printFindings(findings)
    console.error(`\nИтог: FAIL — схема расходится с Prisma (${findings.length} находок).`)
    process.exit(1)
  }

  console.log(
    `\nИтог: схема совпадает с Prisma (${prismaAudit.stats.models} моделей, ${prismaAudit.stats.fields} полей` +
      `${live ? `, ${live.stats.tables} таблиц в БД` : ', живая БД не проверена'}) ✓`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
