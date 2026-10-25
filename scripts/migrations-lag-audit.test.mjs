/**
 * Тесты гейта `scripts/migrations-lag-audit.mjs` (пункт 3 «Перенос из SwiftMatch»).
 *
 * Гейт закрывает класс дефекта «миграция, которую никто не применяет, неотличима
 * от применённой»: в этом репозитории пять файлов `server/migrations/*.sql`
 * лежали рядом с knex-миграциями, но knexfile объявляет extension = 'js', поэтому
 * knex их не видел. Тесты фиксируют, что гейт (а) зелёный на настоящем репозитории,
 * (б) красный на каждом из способов потери миграции, (в) честно отказывается
 * работать без БД, а не пропускает проверку.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MIGRATIONS_DIR,
  KNEXFILE,
  SETUP_DB_NAME,
  PRISMA_SCHEMA,
  DOCKERFILE,
  COMPOSE_FILE,
  DOCKERIGNORE,
  parseKnexExtensions,
  parsePrismaModels,
  auditModelCoverage,
  auditDockerWiring,
  extractComposeService,
  migrationName,
  migrationExtension,
  auditMigrationFiles,
  auditMigrationState,
  listMigrationFiles,
} from './migrations-lag-audit.mjs'

function kinds(findings) {
  return findings.map((f) => f.kind)
}

function readRealKnexfile() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  return readFileSync(path.join(root, KNEXFILE), 'utf8')
}

describe('гейт migrations-lag: настоящий репозиторий', () => {
  it('находит расширения из knexfile, а не из собственной константы', () => {
    const exts = parseKnexExtensions(readRealKnexfile())
    expect(exts).toContain('.js')
  })

  it('все файлы каталога миграций применимы (после конвертации .sql → .js)', () => {
    const extensions = parseKnexExtensions(readRealKnexfile())
    const files = listMigrationFiles()
    const { findings, stats } = auditMigrationFiles({ files, extensions })
    expect(findings).toEqual([])
    expect(stats.files).toBeGreaterThan(40)
    expect(stats.extra).toBe(0)
  })

  it('каталог миграций не пуст и читается с диска', () => {
    const files = listMigrationFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files.every((f) => !f.startsWith('.'))).toBe(true)
  })
})

describe('гейт migrations-lag: расширения knex', () => {
  it('берёт extension и приводит к точечной форме', () => {
    expect(parseKnexExtensions("migrations: { extension: 'js' }")).toEqual(['.js'])
    expect(parseKnexExtensions("extension: '.ts'")).toEqual(['.ts'])
  })

  it('учитывает loadExtensions, если он задан', () => {
    const text = "migrations: { loadExtensions: ['.js', '.cjs'], extension: 'js' }"
    expect(parseKnexExtensions(text)).toEqual(expect.arrayContaining(['.js', '.cjs']))
  })

  it('молча не остаётся пустым: без конфига считает .js', () => {
    expect(parseKnexExtensions('export default {}')).toEqual(['.js'])
  })

  it('разбирает имя и расширение файла', () => {
    expect(migrationName('20260702_000001_create_all_tables.js')).toBe('20260702_000001_create_all_tables')
    expect(migrationName('20260921_sla_pause.sql')).toBe('20260921_sla_pause')
    expect(migrationExtension('20260921_sla_pause.sql')).toBe('.sql')
    expect(migrationExtension('noext')).toBe('')
  })
})

describe('гейт migrations-lag: статические проверки файлов', () => {
  it('зелёный на конфигурации без .sql', () => {
    const files = ['20260701_a.js', '20260702_b.js']
    expect(auditMigrationFiles({ files, extensions: ['.js'] }).findings).toEqual([])
  })

  it('красный на файле, который knex не подхватит (главный класс дефекта)', () => {
    const { findings, stats } = auditMigrationFiles({
      files: ['20260701_a.js', '20260921_automation_rules.sql'],
      extensions: ['.js'],
    })
    expect(kinds(findings)).toContain('extension')
    expect(findings.find((f) => f.kind === 'extension').msg).toContain('20260921_automation_rules.sql')
    expect(stats.extra).toBe(1)
  })

  it('красный на одном имени с двумя расширениями (одно потеряется молча)', () => {
    const { findings } = auditMigrationFiles({
      files: ['20260701_a.js', '20260701_a.sql'],
      extensions: ['.js', '.sql'],
    })
    expect(kinds(findings)).toContain('duplicate')
  })

  it('красный на пустом каталоге — проверять нечего, это не успех', () => {
    const { findings, stats } = auditMigrationFiles({ files: [], extensions: ['.js'] })
    expect(kinds(findings)).toContain('vacuous')
    expect(stats.files).toBe(0)
  })

  it('зелёный только когда файлы есть: не путает «нет находок» с «нет данных»', () => {
    const ok = auditMigrationFiles({ files: ['a.js'], extensions: ['.js'] })
    expect(ok.findings).toEqual([])
    expect(ok.stats.files).toBe(1)
  })
})

describe('гейт migrations-lag: сверка файлов с knex_migrations', () => {
  const files = ['20260701_a.js', '20260702_b.js', '20260921_c.sql']

  it('зелёный, когда применено ровно то, что лежит на диске (имена с расширением)', () => {
    const { findings, stats } = auditMigrationState({
      files,
      applied: ['20260701_a.js', '20260702_b.js'],
      extensions: ['.js'],
      tableExists: true,
    })
    expect(findings).toEqual([])
    expect(stats.lag).toBe(0)
    expect(stats.drift).toBe(0)
    expect(stats.files).toBe(2)
  })

  it('красный на отставании: файл есть, в журнале — нет', () => {
    const { findings, stats } = auditMigrationState({
      files,
      applied: ['20260701_a.js'],
      extensions: ['.js'],
      tableExists: true,
    })
    expect(kinds(findings)).toContain('lag')
    expect(stats.lag).toBe(1)
    expect(findings[0].msg).toContain('20260702_b.js')
  })

  it('красный на дрейфе: в журнале запись без файла', () => {
    const { findings, stats } = auditMigrationState({
      files,
      applied: ['20260701_a.js', '20260702_b.js', '20260703_removed.js'],
      extensions: ['.js'],
      tableExists: true,
    })
    expect(kinds(findings)).toContain('drift')
    expect(stats.drift).toBe(1)
    expect(findings[0].msg).toContain('20260703_removed.js')
  })

  it('.sql на диске не считается ни lag, ни применённой миграцией (его ловит статика)', () => {
    const { findings, stats } = auditMigrationState({
      files: ['20260921_c.sql'],
      applied: [],
      extensions: ['.js'],
      tableExists: true,
    })
    expect(findings).toEqual([])
    expect(stats.files).toBe(0)
  })

  it('красный, если таблицы knex_migrations нет вообще: миграции не накатывались', () => {
    const { findings, stats } = auditMigrationState({
      files,
      applied: [],
      extensions: ['.js'],
      tableExists: false,
    })
    expect(kinds(findings)).toContain('no-table')
    expect(stats.lag).toBe(3)
  })
})

describe('гейт migrations-lag: имя БД для --setup', () => {
  it('фиксировано, чтобы CI и разработчик проверяли одно и то же', () => {
    expect(SETUP_DB_NAME).toBe('servicedesk_migrations_check')
    expect(MIGRATIONS_DIR).toBe('server/migrations')
    expect(KNEXFILE).toBe('server/knexfile.js')
  })
})

describe('гейт migrations-lag: покрытие моделей prisma таблицами (CON-02)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

  it('разбирает модели и не считает моделью строку-комментарий', () => {
    const models = parsePrismaModels(
      ['// model commented {', '/// model doc {', 'model real_one {', '  id Int', '}', 'model real_two {', '}'].join('\n'),
    )
    expect(models).toEqual(['real_one', 'real_two'])
  })

  it('на настоящей схеме находит модели кастомных полей (иначе гейту нечего сверять)', () => {
    const models = parsePrismaModels(read(PRISMA_SCHEMA))
    expect(models.length).toBeGreaterThan(30)
    expect(models).toContain('custom_field_definitions')
    expect(models).toContain('custom_field_values')
  })

  it('модель без таблицы — находка missing-table с именем модели', () => {
    const { findings, stats } = auditModelCoverage({
      models: ['tickets', 'custom_field_definitions'],
      tables: ['tickets', 'knex_migrations', 'knex_migrations_lock'],
    })
    expect(kinds(findings)).toEqual(['missing-table'])
    expect(findings[0].msg).toContain('custom_field_definitions')
    expect(stats.missing).toBe(1)
  })

  it('все модели покрыты — находок нет', () => {
    const { findings, stats } = auditModelCoverage({ models: ['a', 'b'], tables: ['a', 'b', 'knex_migrations'] })
    expect(findings).toEqual([])
    expect(stats.models).toBe(2)
    expect(stats.missing).toBe(0)
  })

  it('пустой разбор моделей — находка vacuous, а не «всё сошлось»', () => {
    const { findings } = auditModelCoverage({ models: [], tables: ['tickets'] })
    expect(kinds(findings)).toEqual(['vacuous'])
  })

  it('схема кастомных полей объявлена только миграцией, а не харнессом', () => {
    const migration = listMigrationFiles().find((file) => file.includes('custom_field_definitions'))
    expect(migration).toBeDefined()
    expect(read(path.join(MIGRATIONS_DIR, migration))).toContain("createTable('custom_field_definitions'")

    const harness = readFileSync(path.join(root, 'server/test-db-setup.js'), 'utf8')
    expect(harness).not.toContain('CREATE TABLE IF NOT EXISTS custom_field')
  })
})

describe('гейт migrations-lag: Docker накатывает миграции (RLS-06)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

  const dockerfileOk = [
    'COPY --from=build /app/knexfile.js ./',
    'COPY --from=build /app/migrations ./migrations',
  ].join('\n')

  const composeOk = [
    'services:',
    '  mysql:',
    '    image: mysql:8.4',
    '  migrate:',
    '    build: ./server',
    '    command: ["npm", "run", "migrate"]',
    '    depends_on:',
    '      mysql:',
    '        condition: service_healthy',
    '  api:',
    '    build: ./server',
    '    depends_on:',
    '      migrate:',
    '        condition: service_completed_successfully',
    'volumes:',
    '  mysql_data:',
  ].join('\n')

  it('зелёный на настоящем репозитории', () => {
    const result = auditDockerWiring({
      dockerfileText: read(DOCKERFILE),
      composeText: read(COMPOSE_FILE),
      dockerignoreText: read(DOCKERIGNORE),
    })
    expect(result.findings).toEqual([])
    expect(result.stats).toEqual({ dockerfile: true, migrate: true, apiWaits: true, ignore: true })
  })

  it('красный, когда .dockerignore отсутствует — в контекст едут node_modules и logs', () => {
    const result = auditDockerWiring({
      dockerfileText: dockerfileOk,
      composeText: composeOk,
      dockerignoreText: '',
    })
    expect(kinds(result.findings)).toContain('dockerignore-missing')
  })

  it('красный, когда .dockerignore не исключает node_modules и logs', () => {
    const result = auditDockerWiring({
      dockerfileText: dockerfileOk,
      composeText: composeOk,
      dockerignoreText: 'node_modules\n.env\n',
    })
    expect(kinds(result.findings)).toContain('dockerignore-context')
  })

  it('красный, когда образ не копирует migrations/', () => {
    const result = auditDockerWiring({
      dockerfileText: 'COPY --from=build /app/knexfile.js ./',
      composeText: composeOk,
    })
    expect(kinds(result.findings)).toContain('docker-no-migrations')
  })

  it('красный, когда образ не копирует knexfile.js', () => {
    const result = auditDockerWiring({
      dockerfileText: 'COPY --from=build /app/migrations ./migrations',
      composeText: composeOk,
      dockerignoreText: 'node_modules\nlogs\n',
    })
    expect(kinds(result.findings)).toContain('docker-no-knexfile')
  })

  it('красный, когда в compose нет сервиса migrate', () => {
    const compose = composeOk.replace('    command: ["npm", "run", "migrate"]\n', '')
    const result = auditDockerWiring({ dockerfileText: dockerfileOk, composeText: compose })
    expect(kinds(result.findings)).toContain('compose-no-migrate')
  })

  it('красный, когда api не ждёт завершения migrate', () => {
    const compose = composeOk.replace(
      '      migrate:\n        condition: service_completed_successfully',
      '      mysql:\n        condition: service_healthy',
    )
    const result = auditDockerWiring({ dockerfileText: dockerfileOk, composeText: compose })
    expect(kinds(result.findings)).toContain('compose-api-not-waiting')
  })

  it('красный, когда seed.sql снова монтируется как initdb', () => {
    const compose = composeOk.replace(
      '    image: mysql:8.4',
      '    image: mysql:8.4\n    volumes:\n      - ./server/seed.sql:/docker-entrypoint-initdb.d/seed.sql',
    )
    const result = auditDockerWiring({ dockerfileText: dockerfileOk, composeText: compose })
    expect(kinds(result.findings)).toContain('compose-seed-initdb')
  })

  it('не считает командой миграций строку в чужом сервисе', () => {
    const compose = composeOk
      .replace('    command: ["npm", "run", "migrate"]\n', '')
      .replace('    image: mysql:8.4', '    image: mysql:8.4\n    command: ["npm", "run", "migrate"]')
    const result = auditDockerWiring({ dockerfileText: dockerfileOk, composeText: compose })
    expect(kinds(result.findings)).toContain('compose-no-migrate')
  })

  it('изолирует блок сервиса до следующего сервиса', () => {
    const block = extractComposeService(composeOk, 'migrate')
    expect(block).toContain('npm')
    expect(block).not.toContain('api:')
    expect(extractComposeService(composeOk, 'missing')).toBe('')
  })

  it('не прочитанные файлы — vacuous, а не зелёный', () => {
    expect(kinds(auditDockerWiring({ dockerfileText: '', composeText: '' }).findings)).toContain('vacuous')
  })
})
