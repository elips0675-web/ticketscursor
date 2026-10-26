/**
 * Тесты гейта `scripts/check-compose-logging.mjs`.
 *
 * Правило: гейт обязан быть (а) зелёным на настоящем репозитории и (б) красным
 * при каждой реальной поломке — нет `logging:` у сервиса, `driver: none`,
 * нет `max-size`/`max-file`, ссылка на несуществующий якорь, лимит 500 МБ,
 * `max-file: 20`, нет retention у Prometheus, `docker system prune -a` /
 * `image prune -a` / `volume prune` в workflow. Гейт, который ищет слово
 * `logging` в файле, был бы зелёным при лимите в 500 МБ и при `max-file: 100`.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  audit,
  findPruneCalls,
  getAnchors,
  getLogging,
  getPrometheusRetention,
  getServiceNames,
  parseSize,
  stripCommentLines,
} from './check-compose-logging.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let dir

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'compose-logging-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function composeFixture({
  anchor = true,
  anchorDriver = 'json-file',
  anchorMaxSize = '10m',
  anchorMaxFile = '3',
  apiLogging = 'logging: *default-logging',
  frontendLogging = 'logging: *default-logging',
  prometheusLogging = 'logging: *default-logging',
  prometheusRetention = true,
} = {}) {
  const lines = []
  if (anchor) {
    lines.push('x-logging: &default-logging')
    if (anchorDriver) lines.push(`  driver: ${anchorDriver}`)
    lines.push('  options:')
    if (anchorMaxSize) lines.push(`    max-size: "${anchorMaxSize}"`)
    if (anchorMaxFile) lines.push(`    max-file: "${anchorMaxFile}"`)
    lines.push('')
  }
  lines.push('services:')
  lines.push('  prometheus:')
  lines.push('    image: prom/prometheus:v2.53.0')
  lines.push('    command:')
  if (prometheusRetention) lines.push("      - '--storage.tsdb.retention.time=15d'")
  lines.push("      - '--storage.tsdb.path=/prometheus'")
  if (prometheusLogging) lines.push(`    ${prometheusLogging}`)
  lines.push('  api:')
  lines.push('    image: tickets-api')
  if (apiLogging) lines.push(`    ${apiLogging}`)
  lines.push('  frontend:')
  lines.push('    image: tickets-frontend')
  if (frontendLogging) lines.push(`    ${frontendLogging}`)
  return lines.join('\n') + '\n'
}

function deployFixture({ prune = null } = {}) {
  const lines = [
    'name: CI',
    'jobs:',
    '  deploy:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Deploy',
    '        run: |',
    '          set -e',
    '          docker compose up -d --build --wait',
  ]
  if (prune) lines.push(`          ${prune}`)
  lines.push('          docker compose ps')
  return lines.join('\n') + '\n'
}

function run({ compose = {}, deploy = {} } = {}) {
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
  writeFileSync(path.join(dir, 'docker-compose.yml'), composeFixture(compose))
  writeFileSync(path.join(dir, '.github', 'workflows', 'deploy.yml'), deployFixture(deploy))
  return audit(dir)
}

function problemsOf(opts) {
  return run(opts).problems.join('\n')
}

describe('check-compose-logging: корректный рецепт', () => {
  it('зелёный на compose с якорем лимитов и retention у Prometheus', () => {
    const { problems, facts } = run()
    expect(problems).toEqual([])
    expect(facts.services).toHaveLength(3)
    expect(facts.retention).toEqual({ time: '15d', size: '' })
    expect(facts.prunes).toBe(0)
  })

  it('зелёный на настоящем репозитории', () => {
    expect(audit(ROOT).problems).toEqual([])
  })

  it('раскрывает якорь и читает лимиты, а не только слово logging', () => {
    expect(getLogging(composeFixture(), 'api')).toEqual({
      driver: 'json-file',
      maxSize: '10m',
      maxFile: '3',
      source: 'default-logging',
    })
  })

  it('принимает лимиты, выписанные в сервисе без якоря', () => {
    const inline = composeFixture({ anchor: false, apiLogging: '' }).replace(
      '  api:\n    image: tickets-api\n',
      '  api:\n    image: tickets-api\n    logging:\n      driver: json-file\n      options:\n        max-size: "5m"\n        max-file: "2"\n',
    )
    expect(getLogging(inline, 'api')).toEqual({ driver: 'json-file', maxSize: '5m', maxFile: '2', source: 'inline' })
  })

  it('перечисляет все сервисы настоящего compose, а не подмножество', () => {
    expect(getServiceNames(composeFixture())).toEqual(['prometheus', 'api', 'frontend'])
    expect(getServiceNames(readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8'))).toEqual([
      'mysql',
      'meilisearch',
      'redis',
      'db_backup',
      'migrate',
      'api',
      'frontend',
      'prometheus',
      'grafana',
    ])
  })

  it('понимает единицы размера', () => {
    expect(parseSize('10m')).toBe(10 * 1024 * 1024)
    expect(parseSize('"1g"')).toBe(1024 ** 3)
    expect(parseSize('512k')).toBe(512 * 1024)
    expect(parseSize('10 MB')).toBe(null)
    expect(parseSize('')).toBe(null)
  })

  it('падает, если compose пуст — иначе гейт проверяет пустое множество', () => {
    writeFileSync(path.join(dir, 'docker-compose.yml'), 'services:\n')
    mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
    writeFileSync(path.join(dir, '.github', 'workflows', 'deploy.yml'), deployFixture())
    expect(audit(dir).problems.join('\n')).toContain('не найдено ни одного сервиса')
  })

  it('падает, если compose отсутствует', () => {
    mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
    writeFileSync(path.join(dir, '.github', 'workflows', 'deploy.yml'), deployFixture())
    expect(audit(dir).problems.join('\n')).toContain('файл не найден')
  })
})

describe('check-compose-logging: логи без лимита', () => {
  it('ловит сервис без logging: вообще', () => {
    expect(problemsOf({ compose: { apiLogging: '' } })).toContain('у сервиса api нет logging:')
  })

  it('ловит logging у одного сервиса и отсутствие у соседнего', () => {
    expect(problemsOf({ compose: { frontendLogging: '' } })).toContain('у сервиса frontend нет logging:')
  })

  it('ловит driver, отличный от json-file', () => {
    expect(problemsOf({ compose: { anchorDriver: 'none' } })).toContain('driver «none»')
  })

  it('ловит отсутствие max-size', () => {
    expect(problemsOf({ compose: { anchorMaxSize: '' } })).toContain('нет max-size')
  })

  it('ловит отсутствие max-file', () => {
    expect(problemsOf({ compose: { anchorMaxFile: '' } })).toContain('нет max-file')
  })

  it('ловит ссылку на несуществующий якорь — лимита фактически нет', () => {
    expect(problemsOf({ compose: { apiLogging: 'logging: *unknown-anchor' } })).toContain('у сервиса api нет logging:')
  })

  it('ловит max-size больше 100 МБ — это не лимит', () => {
    expect(problemsOf({ compose: { anchorMaxSize: '500m' } })).toContain('больше 100 МБ')
  })

  it('ловит max-file больше 10 — файлы снова складываются в гигабайты', () => {
    expect(problemsOf({ compose: { anchorMaxFile: '20' } })).toContain('max-file=20')
  })

  it('ловит max-file = 0 — ротации нет', () => {
    expect(problemsOf({ compose: { anchorMaxFile: '0' } })).toContain('нет max-file')
  })
})

describe('check-compose-logging: том Prometheus', () => {
  it('ловит отсутствие retention — том растёт без ограничения', () => {
    expect(problemsOf({ compose: { prometheusRetention: false } })).toContain('нет --storage.tsdb.retention')
  })

  it('принимает ограничение только по размеру', () => {
    expect(getAnchors(composeFixture())).toHaveProperty('default-logging')
    const onlySize = composeFixture().replace(
      "      - '--storage.tsdb.retention.time=15d'",
      "      - '--storage.tsdb.retention.size=2GB'",
    )
    mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
    writeFileSync(path.join(dir, 'docker-compose.yml'), onlySize)
    writeFileSync(path.join(dir, '.github', 'workflows', 'deploy.yml'), deployFixture())
    expect(audit(dir).problems).toEqual([])
    expect(getPrometheusRetention(onlySize)).toEqual({ time: '', size: '2GB' })
  })
})

describe('check-compose-logging: очистка диска, уносящая откат', () => {
  it('ловит docker system prune -a в деплое', () => {
    const problems = problemsOf({ deploy: { prune: 'docker system prune -af' } })
    expect(problems).toContain('docker system prune')
    expect(problems).toContain(':rollback')
  })

  it('ловит docker image prune -a — исчезает цель отката', () => {
    expect(problemsOf({ deploy: { prune: 'docker image prune -a -f' } })).toContain('docker image prune -a')
  })

  it('ловит docker volume prune — уносит mysql_data и uploads_data', () => {
    expect(problemsOf({ deploy: { prune: 'docker volume prune -f' } })).toContain('docker volume prune')
  })

  it('не ругается на безопасную чистку dangling-образов без -a', () => {
    expect(problemsOf({ deploy: { prune: 'docker image prune -f' } })).toEqual('')
  })

  it('не падает на комментарии, где prune объяснён, — пояснение не исполняется', () => {
    expect(problemsOf({ deploy: { prune: '# нельзя: docker system prune -a уносит :rollback' } })).toEqual('')
  })

  it('stripCommentLines сохраняет нумерацию строк', () => {
    const text = '# шапка\ndocker system prune -f\n# хвост\n'
    expect(stripCommentLines(text).split('\n')).toHaveLength(4)
    expect(stripCommentLines(text).split('\n')[1]).toBe('docker system prune -f')
  })

  it('падает, если каталог workflow отсутствует — запрет проверить нечем', () => {
    expect(findPruneCalls(dir).map((f) => f.text).join('\n')).toContain('каталог workflow не найден')
  })
})
