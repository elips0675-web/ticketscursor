/**
 * Тесты гейта `scripts/schema-drift-audit.mjs`.
 *
 * Гейт закрывает класс дефекта «Prisma-схема и миграции — два независимых
 * источника»: ENUM вместо String (`reopened` → WARN_DATA_TRUNCATED), короткий
 * VARCHAR, поле в запросах без колонки (`email_message_id` →
 * PrismaClientValidationError), заплатки схемы в тест-харнессе. Тесты фиксируют,
 * что гейт (а) зелёный на настоящем репозитории, (б) красный на каждом классе
 * находки, (в) не считает пустой разбор успехом.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PRISMA_SCHEMA,
  SEED_SQL,
  MIGRATIONS_DIR,
  TEST_DB_SETUP,
  parsePrismaSchema,
  parseSeedTables,
  parseMigrationTables,
  auditPrisma,
  auditSchema,
  auditSeed,
  auditMigrationCoverage,
  auditHarness,
} from './schema-drift-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function realMigrationText() {
  return readdirSync(path.join(ROOT, MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.js') && !name.startsWith('.'))
    .sort()
    .map((name) => readFileSync(path.join(ROOT, MIGRATIONS_DIR, name), 'utf8'))
    .join('\n')
}

function kinds(findings) {
  return findings.map((finding) => finding.kind)
}

function model(name, fields, table = name) {
  return { name, table, fields }
}

function field(name, type, { optional = false, dbType = null } = {}) {
  return { name, type, optional, dbType, list: false, isRelation: false }
}

function column(table, name, dataType, columnType, nullable = true) {
  return { table, name, dataType, columnType, nullable, defaultValue: null }
}

describe('гейт schema-drift: настоящий репозиторий', () => {
  const models = parsePrismaSchema(read(PRISMA_SCHEMA))

  it('разбирает Prisma-схему и видит объявленные поля', () => {
    expect(models.length).toBe(45)
    const tickets = models.find((entry) => entry.table === 'tickets')
    expect(tickets).toBeTruthy()
    expect(tickets.fields.find((entry) => entry.name === 'email_message_id')).toBeTruthy()
    expect(tickets.fields.find((entry) => entry.name === 'status').type).toBe('String')
    expect(tickets.fields.some((entry) => entry.name === 'ticket_messages')).toBe(false)
  })

  it('каждая модель создаётся миграцией, включая raw CREATE TABLE с экранированным backtick', () => {
    const created = parseMigrationTables(realMigrationText())
    expect(created.has('ticket_recurrences')).toBe(true)
    expect(created.has('api_tokens')).toBe(true)
    expect(created.has('webhooks')).toBe(true)
    expect(created.has('automation_rules')).toBe(true)
    expect(auditMigrationCoverage({ models, migrationText: realMigrationText() }).findings).toEqual([])
  })

  it('seed.sql не объявляет лишних колонок и не расходится по типу', () => {
    const result = auditSeed({ models, seedTables: parseSeedTables(read(SEED_SQL)) })
    expect(result.findings).toEqual([])
    expect(result.stats.tables).toBe(14)
  })

  it('тест-харнесс не правит схему после миграций', () => {
    expect(auditHarness({ text: read(TEST_DB_SETUP) }).findings).toEqual([])
  })

  it('Prisma-схема не пуста и не содержит моделей без полей', () => {
    const result = auditPrisma({ models })
    expect(result.findings).toEqual([])
    expect(result.stats.fields).toBeGreaterThan(300)
  })
})

describe('гейт schema-drift: разбор Prisma', () => {
  const sample = [
    'model User {',
    '  id        Int      @id',
    '  role      String?  @db.VarChar(20)',
    '  posts     Post[]',
    '  profile   Profile?',
    '  manager_id Int?',
    '  manager   User?    @relation("mgr", fields: [manager_id], references: [id])',
    '  @@map("users")',
    '}',
    'model Post {',
    '  id     Int  @id',
    '  author User @relation(fields: [author_id], references: [id])',
    '}',
    'model Profile {',
    '  id Int @id',
    '}',
  ].join('\n')

  it('берёт имя таблицы из @@map и пропускает relation-поля', () => {
    const [user] = parsePrismaSchema(sample)
    expect(user.table).toBe('users')
    expect(user.fields.map((entry) => entry.name)).toEqual(['id', 'role', 'manager_id'])
  })

  it('разбирает @db.VarChar(N) и optional', () => {
    const [user] = parsePrismaSchema(sample)
    const role = user.fields.find((entry) => entry.name === 'role')
    expect(role.optional).toBe(true)
    expect(role.dbType).toEqual({ name: 'VarChar', length: 20, scale: null })
  })

  it('пустая схема — находка vacuous, а не «всё хорошо»', () => {
    const result = auditPrisma({ models: [] })
    expect(kinds(result.findings)).toContain('vacuous')
  })
})

describe('гейт schema-drift: сверка Prisma с живой схемой', () => {
  const models = [
    model('tickets', [
      field('id', 'Int'),
      field('title', 'String', { dbType: { name: 'VarChar', length: 500 } }),
      field('status', 'String', { optional: true, dbType: { name: 'VarChar', length: 20 } }),
      field('email_message_id', 'String', { optional: true, dbType: { name: 'VarChar', length: 500 } }),
    ]),
    model('files', [field('id', 'Int'), field('active', 'Boolean')]),
    model('articles', [field('id', 'Int'), field('body', 'String', { dbType: { name: 'Text' } })]),
  ]

  function healthyColumns() {
    return [
      column('tickets', 'id', 'int', 'int', false),
      column('tickets', 'title', 'varchar', 'varchar(500)', false),
      column('tickets', 'status', 'varchar', 'varchar(20)', false),
      column('tickets', 'email_message_id', 'varchar', 'varchar(500)', true),
      column('files', 'id', 'int', 'int', false),
      column('files', 'active', 'tinyint', 'tinyint(1)', true),
      column('articles', 'id', 'int', 'int', false),
      column('articles', 'body', 'text', 'text', true),
    ]
  }

  it('зелёный на совпадающей схеме (Boolean ↔ tinyint(1) — не дрейф)', () => {
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns: healthyColumns() })
    expect(result.findings).toEqual([])
  })

  it('красный, когда модели нет таблицы', () => {
    const columns = healthyColumns().filter((entry) => entry.table !== 'files')
    const result = auditSchema({ models, tables: ['tickets', 'articles'], columns })
    expect(kinds(result.findings)).toContain('missing-table')
  })

  it('красный, когда поля нет колонки (класс email_message_id)', () => {
    const columns = healthyColumns().filter((entry) => entry.name !== 'email_message_id')
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns })
    expect(kinds(result.findings)).toContain('missing-column')
    expect(result.findings.find((entry) => entry.kind === 'missing-column').msg).toContain('email_message_id')
  })

  it('красный на ENUM вместо String (класс reopened)', () => {
    const columns = healthyColumns().map((entry) =>
      entry.name === 'status' ? column('tickets', 'status', 'enum', "enum('open','closed')", false) : entry,
    )
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns })
    const finding = result.findings.find((entry) => entry.kind === 'enum-column')
    expect(finding).toBeTruthy()
    expect(finding.msg).toContain('WARN_DATA_TRUNCATED')
  })

  it('красный на коротком VARCHAR', () => {
    const columns = healthyColumns().map((entry) =>
      entry.name === 'title' ? column('tickets', 'title', 'varchar', 'varchar(255)', false) : entry,
    )
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns })
    expect(kinds(result.findings)).toContain('short-varchar')
  })

  it('красный на несовместимом семействе типов', () => {
    const columns = healthyColumns().map((entry) =>
      entry.name === 'id' && entry.table === 'tickets' ? column('tickets', 'id', 'varchar', 'varchar(36)', false) : entry,
    )
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns })
    expect(kinds(result.findings)).toContain('type-family')
  })

  it('красный на Prisma Text при VARCHAR в БД', () => {
    const columns = healthyColumns().map((entry) =>
      entry.name === 'body' ? column('articles', 'body', 'varchar', 'varchar(500)', true) : entry,
    )
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns })
    expect(kinds(result.findings)).toContain('short-varchar')
  })

  it('nullability измеряется, но в находки не попадает', () => {
    const result = auditSchema({ models, tables: ['tickets', 'files', 'articles'], columns: healthyColumns() })
    expect(result.findings).toEqual([])
    expect(result.warnings.some((entry) => entry.includes('tickets.status'))).toBe(true)
  })

  it('пустой список колонок — vacuous, а не зелёный', () => {
    const result = auditSchema({ models, tables: [], columns: [] })
    expect(kinds(result.findings)).toContain('vacuous')
  })
})

describe('гейт schema-drift: seed.sql как вторая копия схемы', () => {
  const models = [model('tickets', [field('title', 'String', { dbType: { name: 'VarChar', length: 500 } })])]

  function seedWith(columnLine) {
    return parseSeedTables(`CREATE TABLE IF NOT EXISTS tickets (\n  ${columnLine}\n) ENGINE=InnoDB;`)
  }

  it('зелёный, когда колонка совпадает', () => {
    expect(auditSeed({ models, seedTables: seedWith('title VARCHAR(500) NOT NULL') }).findings).toEqual([])
  })

  it('красный на ENUM вместо String', () => {
    const result = auditSeed({ models, seedTables: seedWith("title ENUM('a','b') NOT NULL") })
    expect(kinds(result.findings)).toContain('enum-column')
  })

  it('красный на коротком VARCHAR', () => {
    const result = auditSeed({ models, seedTables: seedWith('title VARCHAR(255) NOT NULL') })
    expect(kinds(result.findings)).toContain('short-varchar')
  })

  it('красный на лишней колонке, которой нет в Prisma', () => {
    const result = auditSeed({ models, seedTables: seedWith('legacy VARCHAR(10)') })
    expect(kinds(result.findings)).toContain('seed-extra-column')
  })

  it('красный на таблице, которой нет в Prisma', () => {
    const seedTables = parseSeedTables('CREATE TABLE IF NOT EXISTS ghosts (\n  id INT\n);')
    const result = auditSeed({ models, seedTables })
    expect(kinds(result.findings)).toContain('seed-unknown-table')
  })

  it('пустой seed — vacuous', () => {
    expect(kinds(auditSeed({ models, seedTables: new Map() }).findings)).toContain('vacuous')
  })
})

describe('гейт schema-drift: покрытие миграциями', () => {
  const models = [model('tickets', [field('id', 'Int')])]

  it('красный, когда модель не создаётся ни одной миграцией', () => {
    const result = auditMigrationCoverage({ models, migrationText: "createTable('other', () => {})" })
    expect(kinds(result.findings)).toContain('no-create-table')
  })

  it('принимает raw CREATE TABLE с экранированным backtick', () => {
    const result = auditMigrationCoverage({
      models,
      migrationText: 'knex.raw(`CREATE TABLE IF NOT EXISTS \\`tickets\\` (id INT)`)',
    })
    expect(result.findings).toEqual([])
  })

  it('пустой текст миграций — vacuous', () => {
    expect(kinds(auditMigrationCoverage({ models, migrationText: '' }).findings)).toContain('vacuous')
  })
})

describe('гейт schema-drift: тест-харнесс не правит схему', () => {
  it('красный на ALTER TABLE', () => {
    const result = auditHarness({ text: "await conn.execute('ALTER TABLE employees MODIFY COLUMN role VARCHAR(20)')" })
    expect(kinds(result.findings)).toContain('harness-patch')
  })

  it('красный на addColumnIfNotExists', () => {
    expect(kinds(auditHarness({ text: 'await addColumnIfNotExists(conn)' }).findings)).toContain('harness-patch')
  })

  it('красный на CREATE TABLE', () => {
    expect(kinds(auditHarness({ text: 'await conn.execute("CREATE TABLE x (id INT)")' }).findings)).toContain(
      'harness-patch',
    )
  })

  it('не считает находкой упоминание в комментарии', () => {
    const text = '// раньше здесь был ALTER TABLE employees\nawait prepare()\n'
    expect(auditHarness({ text }).findings).toEqual([])
  })

  it('пустой файл — vacuous', () => {
    expect(kinds(auditHarness({ text: '' }).findings)).toContain('vacuous')
  })
})
