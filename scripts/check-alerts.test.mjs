/**
 * Тесты гейта `scripts/check-alerts.mjs` (пункт 2 «Перенос из SwiftMatch»).
 *
 * Правило: гейт обязан быть (а) зелёным на настоящем репозитории, (б) красным
 * при каждой реальной поломке правил алертинга — метрика, которой нет в
 * источниках; правило без `for`/`severity`/`summary`/`description`; файл не
 * подключён в `rule_files` или не смонтирован в compose; разбор не нашёл
 * ничего (иначе гейт «проверяет пустоту»).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  RULES_FILE,
  RULES_MOUNT,
  PROMETHEUS_CONFIG,
  METRICS_SOURCES,
  MIN_METRIC_FAMILIES,
  parseRuleFile,
  metricsInExpr,
  declaredMetricFamilies,
  allowedMetricNames,
  ruleFilePaths,
  composeMounts,
  splitKv,
  parseScalar,
  stripComment,
  auditAlerts,
} from './check-alerts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

function kinds(findings) {
  return findings.map((f) => f.kind)
}

function lines(...items) {
  return items.join('\n') + '\n'
}

const METRICS_FIXTURE = lines(
  '# HELP http_requests_total Total',
  '# TYPE http_requests_total counter',
  '# HELP http_request_duration_ms Request duration',
  '# TYPE http_request_duration_ms histogram',
  '# HELP process_cpu_seconds_total CPU',
  '# TYPE process_cpu_seconds_total counter',
  '# HELP nodejs_eventloop_lag_seconds Lag',
  '# TYPE nodejs_eventloop_lag_seconds gauge',
  '# HELP process_resident_memory_bytes RSS',
  '# TYPE process_resident_memory_bytes gauge',
)

const RULES_FIXTURE = lines(
  'groups:',
  '  - name: test-group',
  '    rules:',
  '      - alert: TestApiDown',
  '        expr: \'up{job="api"} == 0\'',
  '        for: 2m',
  '        labels:',
  '          severity: critical',
  '        annotations:',
  '          summary: \'API недоступен\'',
  '          description: \'up в нуле дольше двух минут.\'',
)

const PROMETHEUS_FIXTURE = lines(
  'global:',
  '  scrape_interval: 15s',
  '',
  'rule_files:',
  `  - '${RULES_MOUNT}'`,
  '',
  'scrape_configs:',
  "  - job_name: 'api'",
)

const COMPOSE_FIXTURE = lines(
  'services:',
  '  prometheus:',
  '    image: prom/prometheus:v2.53.0',
  '    volumes:',
  '      - prometheus_data:/prometheus',
  `      - ./${RULES_FILE}:${RULES_MOUNT}`,
)

function goodInput(overrides = {}) {
  return {
    ruleText: RULES_FIXTURE,
    prometheusText: PROMETHEUS_FIXTURE,
    composeText: COMPOSE_FIXTURE,
    metricsSources: [METRICS_FIXTURE],
    ...overrides,
  }
}

describe('гейт alerts: настоящий репозиторий', () => {
  const input = {
    ruleText: read(RULES_FILE),
    prometheusText: read(PROMETHEUS_CONFIG),
    composeText: read('docker-compose.yml'),
    metricsSources: METRICS_SOURCES.map(read),
  }
  const { findings, stats } = auditAlerts(input)

  it('не находит ни одной поломки на текущих правилах и конфиге', () => {
    expect(findings).toEqual([])
  })

  it('проверяет не пустоту: правил и метрик достаточно', () => {
    expect(stats.rules).toBeGreaterThanOrEqual(5)
    expect(stats.groups).toBeGreaterThanOrEqual(2)
    expect(stats.families).toBeGreaterThanOrEqual(MIN_METRIC_FAMILIES)
  })

  it('разбирает ожидаемые имена алертов', () => {
    const { groups } = parseRuleFile(read(RULES_FILE))
    const names = groups.flatMap((g) => g.rules.map((r) => r.alert))
    for (const expected of [
      'ServiceDeskApiDown',
      'ServiceDeskApiErrorRate',
      'ServiceDeskApiLatencyP95',
      'ServiceDeskNodeExporterDown',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('подключает и монтирует именно тот файл правил, который читает гейт', () => {
    expect(ruleFilePaths(read(PROMETHEUS_CONFIG))).toContain(RULES_MOUNT)
    expect(composeMounts(read('docker-compose.yml'))).toContainEqual({ source: RULES_FILE, target: RULES_MOUNT })
  })
})

describe('гейт alerts: структура файла правил', () => {
  it('зелёный на корректном фикстуре', () => {
    expect(auditAlerts(goodInput()).findings).toEqual([])
  })

  it('падает на правиле без expr', () => {
    const ruleText = RULES_FIXTURE.replace("        expr: 'up{job=\"api\"} == 0'\n", '')
    const findings = kinds(auditAlerts(goodInput({ ruleText })).findings)
    expect(findings).toContain('structure')
  })

  it('падает на правиле без for (иначе алерт мигает)', () => {
    const ruleText = RULES_FIXTURE.replace('        for: 2m\n', '')
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.msg.includes('нет «for:»'))).toBe(true)
  })

  it('падает на отсутствующем severity', () => {
    const ruleText = RULES_FIXTURE.replace('          severity: critical\n', '')
    expect(kinds(auditAlerts(goodInput({ ruleText })).findings)).toContain('severity')
  })

  it('падает на severity вне белого списка', () => {
    const ruleText = RULES_FIXTURE.replace('severity: critical', 'severity: blocker')
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.kind === 'severity' && f.msg.includes('blocker'))).toBe(true)
  })

  it('падает на отсутствующем description', () => {
    const ruleText = RULES_FIXTURE.replace("          description: 'up в нуле дольше двух минут.'\n", '')
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.msg.includes('annotations.description'))).toBe(true)
  })

  it('падает на неизвестном ключе правила', () => {
    const ruleText = RULES_FIXTURE.replace("        for: 2m\n", "        for: 2m\n        record: 'x'\n")
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.msg.includes('record'))).toBe(true)
  })

  it('падает на дубликате имени алерта', () => {
    const ruleText =
      RULES_FIXTURE +
      lines(
        '      - alert: TestApiDown',
        '        expr: \'up{job="api"} == 0\'',
        '        for: 2m',
        '        labels:',
        '          severity: warning',
        '        annotations:',
        '          summary: \'дубль\'',
        '          description: \'дубль\'',
      )
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.msg.includes('дубликат имени алерта'))).toBe(true)
  })

  it('падает на неподдерживаемом отступе', () => {
    const ruleText = lines('groups:', '  - name: g', '    rules:', '            - alert: X')
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.msg.includes('отступ') && f.msg.includes('не поддерживается'))).toBe(true)
  })

  it('падает, если в файле не разобрано ни одной группы', () => {
    const { findings } = auditAlerts(goodInput({ ruleText: '# только комментарий\n' }))
    expect(findings.some((f) => f.msg.includes('не разобрано ни одной группы'))).toBe(true)
  })
})

describe('гейт alerts: имена метрик в expr', () => {
  it('ловит метрику, которой нет в источниках', () => {
    const ruleText = RULES_FIXTURE.replace('up{job="api"} == 0', 'http_requests_total_typo > 0')
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.kind === 'metric-unknown' && f.msg.includes('http_requests_total_typo'))).toBe(true)
  })

  it('разрешает стандартные суффиксы гистограммы и запрещает нестандартные', () => {
    const families = declaredMetricFamilies([METRICS_FIXTURE])
    const allowed = allowedMetricNames(families)
    expect(allowed.has('http_request_duration_ms')).toBe(true)
    expect(allowed.has('http_request_duration_ms_bucket')).toBe(true)
    expect(allowed.has('http_request_duration_ms_sum')).toBe(true)
    expect(allowed.has('http_request_duration_ms_count')).toBe(true)
    expect(allowed.has('http_request_duration_ms_avg')).toBe(false)
  })

  it('считает встроенные метрики Prometheus известными', () => {
    const ruleText = RULES_FIXTURE.replace('up{job="api"} == 0', 'up{job="api"} == 0 or ALERTS > 0')
    expect(auditAlerts(goodInput({ ruleText })).findings).toEqual([])
  })

  it('падает, если expr вообще не ссылается на метрику', () => {
    const ruleText = RULES_FIXTURE.replace('up{job="api"} == 0', '1 == 1')
    const { findings } = auditAlerts(goodInput({ ruleText }))
    expect(findings.some((f) => f.msg.includes('не ссылается ни на одну метрику'))).toBe(true)
  })

  it('падает на пустом наборе объявленных метрик (защита от проверки пустоты)', () => {
    const { findings } = auditAlerts(goodInput({ metricsSources: ['// ничего не объявлено\n'] }))
    expect(kinds(findings)).toContain('metric-vacuous')
  })

  it('вытаскивает метрику из сложного выражения мимо функций и селекторов', () => {
    expect(metricsInExpr('histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le)) > 1000')).toEqual([
      'http_request_duration_ms_bucket',
    ])
    expect(metricsInExpr('sum(rate(http_requests_total{status="5xx"}[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 1) > 0.05')).toEqual([
      'http_requests_total',
    ])
    expect(metricsInExpr('resets(process_cpu_seconds_total[1h]) > 2')).toEqual(['process_cpu_seconds_total'])
    expect(metricsInExpr('up{job="node"} == 0')).toEqual(['up'])
  })
})

describe('гейт alerts: проводка в Prometheus и compose', () => {
  it('падает, если prometheus.yml не подключает файл правил', () => {
    const prometheusText = lines('global:', '  scrape_interval: 15s', '', 'scrape_configs:')
    const { findings } = auditAlerts(goodInput({ prometheusText }))
    expect(kinds(findings)).toContain('unwired')
  })

  it('падает, если prometheus.yml подключает другой файл', () => {
    const prometheusText = PROMETHEUS_FIXTURE.replace(RULES_MOUNT, '/etc/prometheus/other.yml')
    const { findings } = auditAlerts(goodInput({ prometheusText }))
    expect(kinds(findings)).toContain('unwired')
  })

  it('падает, если compose не монтирует файл правил', () => {
    const composeText = lines('services:', '  prometheus:', '    volumes:', '      - prometheus_data:/prometheus')
    const { findings } = auditAlerts(goodInput({ composeText }))
    expect(kinds(findings)).toContain('unmounted')
  })

  it('падает, если compose монтирует другой файл по тому же пути', () => {
    const composeText = COMPOSE_FIXTURE.replace(RULES_FILE, 'monitoring/other.yml')
    const { findings } = auditAlerts(goodInput({ composeText }))
    expect(findings.some((f) => f.kind === 'unmounted' && f.msg.includes('не тот файл'))).toBe(true)
  })

  it('читает rule_files и в блочной, и в inline-форме', () => {
    expect(ruleFilePaths(lines('rule_files:', `  - '${RULES_MOUNT}'`))).toEqual([RULES_MOUNT])
    expect(ruleFilePaths(lines(`rule_files: ['${RULES_MOUNT}', '/etc/prometheus/second.yml']`))).toEqual([
      RULES_MOUNT,
      '/etc/prometheus/second.yml',
    ])
    expect(ruleFilePaths(lines('global:', '  scrape_interval: 15s'))).toEqual([])
  })

  it('находит монтирования в compose', () => {
    expect(composeMounts(COMPOSE_FIXTURE)).toContainEqual({ source: RULES_FILE, target: RULES_MOUNT })
    expect(composeMounts(lines('volumes:', '  - data:/data'))).toEqual([])
  })
})

describe('гейт alerts: вспомогательные разборщики', () => {
  it('снимает кавычки только по краям', () => {
    expect(parseScalar("'x'")).toBe('x')
    expect(parseScalar('"x"')).toBe('x')
    expect(parseScalar("it's")).toBe("it's")
    expect(parseScalar('plain')).toBe('plain')
  })

  it('делит ключ и значение по первому двоеточию', () => {
    expect(splitKv("expr: 'a > 1'")).toEqual({ key: 'expr', value: 'a > 1' })
    expect(splitKv('labels:')).toEqual({ key: 'labels', value: '' })
    expect(splitKv("description: 'Ответ: письмо ушло.'")).toEqual({ key: 'description', value: 'Ответ: письмо ушло.' })
  })

  it('не трогает # внутри кавычек', () => {
    expect(stripComment("summary: 'шаг #1' # комментарий")).toBe("summary: 'шаг #1' ")
    expect(stripComment('# целиком комментарий')).toBe('')
    expect(stripComment('expr: a > 1')).toBe('expr: a > 1')
  })

  it('разбирает группу с несколькими правилами', () => {
    const text = lines(
      'groups:',
      '  - name: g1',
      '    rules:',
      '      - alert: A',
      '        expr: \'up == 0\'',
      '        for: 1m',
      '        labels:',
      '          severity: warning',
      '        annotations:',
      '          summary: s',
      '          description: d',
      '      - alert: B',
      '        expr: \'ALERTS > 0\'',
      '        for: 5m',
      '        labels:',
      '          severity: info',
      '        annotations:',
      '          summary: s2',
      '          description: d2',
    )
    const { groups, errors } = parseRuleFile(text)
    expect(errors).toEqual([])
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('g1')
    expect(groups[0].rules.map((r) => r.alert)).toEqual(['A', 'B'])
    expect(groups[0].rules[0].labels.severity).toBe('warning')
    expect(groups[0].rules[1].annotations.summary).toBe('s2')
  })

  it('сообщает о значении у labels в той же строке', () => {
    const text = lines('groups:', '  - name: g', '    rules:', '      - alert: A', "        labels: 'severity: warning'")
    const { errors } = parseRuleFile(text)
    expect(errors.some((e) => e.includes('labels'))).toBe(true)
  })
})
