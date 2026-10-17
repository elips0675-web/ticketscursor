// Гейт «alerts» (пункт 2 «Перенос из SwiftMatch», «Что-доделать.txt»).
//
// Проблема, которую он закрывает: правила алертинга — это тоже код, который
// умирает молча. Prometheus принимает файл правил без единой жалобы, если
// метрика в expr не существует (`up{job="нет-такого"}`), если у правила нет
// `labels.severity` (алерт приходит без приоритета) или если файл вообще не
// подключён к Prometheus (`rule_files`) или не смонтирован в контейнер. Все
// три поломки дают ровно одно наблюдаемое состояние — «алерты стоят в списке
// и никогда не срабатывают», то есть зелёный гейт без единой проверки.
//
// Что проверяет:
//   1. **Структура файла правил.** `monitoring/alerts.yml` читается без
//      зависимостей (разбор подмножества YAML: groups → - name → rules →
//      - alert → expr/for/labels/annotations) — файл, который не разобрался,
//      это FAIL, а не «пропустить».
//   2. **Имена метрик в expr реально существуют.** Имена берутся из самих
//      источников (`# HELP` / `# TYPE` в `server/src/middleware/metrics.js` и
//      `server/src/app.js`), плюс встроенные метрики Prometheus (`up`, `ALERTS`).
//      Для histogram/summary разрешены стандартные суффиксы `_bucket`/`_sum`/`_count`.
//      Нестандартная производная (например `_avg`) — объявляй её явно, иначе
//      гейт её не признает: правило на неизвестную метрику никогда не сработает.
//   3. **Правило не пустое.** Есть expr, `for` (без выдержки алерт мигает),
//      `labels.severity` из белого списка, `annotations.summary`/`description`
//      (иначе дежурный видит имя алерта без объяснения и без подсказки).
//   4. **Файл подключён и смонтирован.** `monitoring/prometheus.yml` обязан
//      указывать его в `rule_files`, а `docker-compose.yml` — монтировать тот же
//      файл по тому же пути (иначе Prometheus читает пустоту, а гейт зелёный).
//
// Использование: node scripts/check-alerts.mjs   (exit 0 — целостно, 1 — расхождение)

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const RULES_FILE = 'monitoring/alerts.yml'
export const RULES_MOUNT = '/etc/prometheus/alerts.yml'
export const PROMETHEUS_CONFIG = 'monitoring/prometheus.yml'
export const COMPOSE_FILE = 'docker-compose.yml'
export const METRICS_SOURCES = ['server/src/middleware/metrics.js', 'server/src/app.js']
export const ALLOWED_SEVERITIES = ['critical', 'warning', 'info']

// Сколько семейств метрик обязано найтись в источниках: меньше — гейт проверяет
// пустоту (переименовали файл, сменился формат объявлений) и обязан падать.
export const MIN_METRIC_FAMILIES = 5

// Метрики, которые Prometheus отдаёт сам, — их в исходниках приложения нет.
export const PROMETHEUS_BUILTIN_METRICS = [
  'up',
  'ALERTS',
  'ALERTS_FOR_STATE',
  'scrape_duration_seconds',
  'scrape_samples_scraped',
  'scrape_samples_post_metric_relabeling',
  'scrape_series_added',
  'scrape_timeout_seconds',
]

// Ключевые слова PromQL, которые лексер выражения примет за имя метрики.
export const PROMQL_KEYWORDS = [
  'and',
  'or',
  'unless',
  'bool',
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'offset',
]

// Убирает комментарий, не трогая `#` внутри кавычек.
export function stripComment(line) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (ch === '#') return line.slice(0, i)
  }
  return line
}

// Снимает обрамляющие кавычки у скаляра YAML.
export function parseScalar(raw) {
  let value = String(raw).trim()
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      value = value.slice(1, -1)
    }
  }
  return value
}

// Делит строку вида `ключ: значение` на пару (значение без кавычек).
export function splitKv(text) {
  const trimmed = text.trim()
  const idx = trimmed.indexOf(':')
  if (idx === -1) return { key: trimmed, value: '' }
  const key = trimmed.slice(0, idx).trim()
  const rest = trimmed.slice(idx + 1).trim()
  return { key, value: parseScalar(rest) }
}

/**
 * Разбирает файл правил Prometheus (подмножество YAML, которое пишет проект).
 * Возвращает `{ groups, errors }`: `groups` — разобранные группы, `errors` —
 * строки про найденные нарушения структуры (гейт их печатает как находки).
 */
export function parseRuleFile(text) {
  const groups = []
  const errors = []
  let group = null
  let rule = null
  let section = null

  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = stripComment(lines[i])
    if (raw.trim() === '') continue
    const indent = raw.length - raw.trimStart().length
    const body = raw.trim()
    const lineNo = i + 1

    if (indent === 0) {
      group = null
      rule = null
      section = null
      if (body !== 'groups:') {
        errors.push(`строка ${lineNo}: ключ верхнего уровня «${body}», а ожидается только «groups:»`)
      }
      continue
    }

    if (indent === 2) {
      rule = null
      section = null
      if (!body.startsWith('- ')) {
        errors.push(`строка ${lineNo}: элемент группы должен начинаться с «- », а не «${body}»`)
        continue
      }
      const { key, value } = splitKv(body.slice(2))
      if (key !== 'name') {
        errors.push(`строка ${lineNo}: у группы допускается только «name:», а не «${key}»`)
        continue
      }
      if (value === '') {
        errors.push(`строка ${lineNo}: у группы пустое «name:»`)
        continue
      }
      group = { name: value, line: lineNo, rules: [] }
      groups.push(group)
      continue
    }

    if (indent === 4) {
      rule = null
      section = null
      if (body !== 'rules:') {
        errors.push(`строка ${lineNo}: у группы допускается только «rules:», а не «${body}»`)
      }
      continue
    }

    if (indent === 6) {
      section = null
      if (!group) {
        errors.push(`строка ${lineNo}: правило вне группы`)
        continue
      }
      if (!body.startsWith('- ')) {
        errors.push(`строка ${lineNo}: правило должно начинаться с «- », а не «${body}»`)
        continue
      }
      const { key, value } = splitKv(body.slice(2))
      if (key !== 'alert') {
        errors.push(`строка ${lineNo}: правило обязано начинаться с «alert:», а не с «${key}»`)
        continue
      }
      rule = { alert: value, line: lineNo, expr: '', for: '', labels: {}, annotations: {} }
      group.rules.push(rule)
      continue
    }

    if (indent === 8) {
      if (!rule) {
        errors.push(`строка ${lineNo}: ключ «${body}» вне правила`)
        continue
      }
      const { key, value } = splitKv(body)
      if (key === 'labels' || key === 'annotations') {
        if (value !== '') {
          errors.push(`строка ${lineNo}: у «${key}:» не может быть значения в этой же строке`)
        }
        section = key
        continue
      }
      section = null
      if (key === 'expr') rule.expr = value
      else if (key === 'for') rule.for = value
      else errors.push(`строка ${lineNo}: у правила допускаются только expr/for/labels/annotations, а не «${key}»`)
      continue
    }

    if (indent === 10) {
      if (!rule || !section) {
        errors.push(`строка ${lineNo}: ключ «${body}» вне labels/annotations`)
        continue
      }
      const { key, value } = splitKv(body)
      if (key === '') {
        errors.push(`строка ${lineNo}: пустой ключ внутри «${section}:»`)
        continue
      }
      rule[section][key] = value
      continue
    }

    errors.push(
      `строка ${lineNo}: отступ ${indent} не поддерживается (структура: groups → - name → rules → - alert → expr/for/labels/annotations)`,
    )
  }

  return { groups, errors }
}

/** Имена метрик, на которые ссылается выражение PromQL. */
export function metricsInExpr(expr) {
  const cleaned = String(expr)
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^()]*\)/g, ' ')
    .replace(/\[\s*\d+[smhdwy]?\s*\]/g, ' ')
    .replace(/\b\d+[smhdwy]\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, ' ')

  const used = []
  const re = /[A-Za-z_:][A-Za-z0-9_:]*/g
  let match
  while ((match = re.exec(cleaned)) !== null) {
    const name = match[0]
    if (/^\s*\(/.test(cleaned.slice(re.lastIndex))) continue // вызов функции
    if (PROMQL_KEYWORDS.includes(name)) continue
    if (name === 'le') continue
    if (!used.includes(name)) used.push(name)
  }
  return used
}

/** Семейства метрик, объявленные в исходниках: `Map<имя, тип>`. */
export function declaredMetricFamilies(sources) {
  const families = new Map()
  const helpNames = new Set()
  for (const text of sources) {
    for (const m of String(text).matchAll(/#\s*HELP\s+([A-Za-z_:][A-Za-z0-9_:]*)/g)) helpNames.add(m[1])
    for (const m of String(text).matchAll(/#\s*TYPE\s+([A-Za-z_:][A-Za-z0-9_:]*)\s+(\w+)/g)) families.set(m[1], m[2])
  }
  for (const name of helpNames) if (!families.has(name)) families.set(name, 'untyped')
  return families
}

/** Белый список имён, пригодных для expr: объявленные семейства + встроенные. */
export function allowedMetricNames(families) {
  const allowed = new Set(PROMETHEUS_BUILTIN_METRICS)
  for (const [name, type] of families) {
    allowed.add(name)
    if (type === 'histogram' || type === 'summary') {
      allowed.add(`${name}_bucket`)
      allowed.add(`${name}_sum`)
      allowed.add(`${name}_count`)
    }
  }
  return allowed
}

/** Пути из блока `rule_files:` в конфиге Prometheus (список или inline-строка). */
export function ruleFilePaths(text) {
  const paths = []
  let inBlock = false
  for (const line of String(text).split(/\r?\n/)) {
    const clean = stripComment(line)
    if (clean.trim() === '') continue
    const indent = clean.length - clean.trimStart().length
    const body = clean.trim()
    if (indent === 0) {
      inBlock = body.startsWith('rule_files:')
      if (inBlock) {
        const inline = body.slice('rule_files:'.length).trim()
        for (const m of inline.matchAll(/['"]([^'"]+)['"]/g)) paths.push(m[1])
      }
      continue
    }
    if (inBlock && body.startsWith('- ')) paths.push(parseScalar(body.slice(2)))
  }
  return paths
}

/** Монтирования вида `./источник:/цель` из docker-compose.yml. */
export function composeMounts(text) {
  const mounts = []
  for (const m of String(text).matchAll(/^\s*-\s*\.\/([^\s:]+):(\/[^\s:]+)/gm)) {
    mounts.push({ source: m[1], target: m[2] })
  }
  return mounts
}

/**
 * Проверяет правила и их проводку. Возвращает `{ findings, stats }`:
 * `findings` — находки `{ kind, msg }`, `stats` — счётчики для отчёта.
 */
export function auditAlerts(input) {
  const findings = []
  const add = (kind, msg) => findings.push({ kind, msg })

  const { groups, errors } = parseRuleFile(input.ruleText)
  for (const e of errors) add('structure', e)

  if (groups.length === 0) {
    add('structure', `${RULES_FILE}: не разобрано ни одной группы — проверять нечего`)
  }

  const families = declaredMetricFamilies(input.metricsSources ?? [])
  if (families.size < MIN_METRIC_FAMILIES) {
    add(
      'metric-vacuous',
      `в ${METRICS_SOURCES.join(', ')} найдено ${families.size} объявленных метрик (< ${MIN_METRIC_FAMILIES}) — гейт проверял бы пустоту`,
    )
  }
  const allowed = allowedMetricNames(families)

  const groupNames = new Set()
  const alertNames = new Set()
  let ruleCount = 0

  groups.forEach((group, gi) => {
    if (groupNames.has(group.name)) add('structure', `дубликат имени группы «${group.name}» (строка ${group.line})`)
    else groupNames.add(group.name)
    if (group.rules.length === 0) add('structure', `группа «${group.name || '#' + (gi + 1)}» без правил`)

    for (const rule of group.rules) {
      ruleCount++
      const where = `${rule.alert || '(без alert)'} (строка ${rule.line})`

      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(rule.alert)) {
        add('structure', `${where}: имя алерта должно быть идентификатором (латиница/цифры/подчёркивание)`)
      } else if (alertNames.has(rule.alert)) {
        add('structure', `дубликат имени алерта «${rule.alert}» (строка ${rule.line})`)
      } else {
        alertNames.add(rule.alert)
      }

      if (!rule.expr) add('structure', `${where}: пустой или отсутствующий expr`)
      if (!rule.for) add('structure', `${where}: нет «for:» — без выдержки алерт мигает на каждом всплеске`)
      else if (!/^\d+(?:\.\d+)?[smhdwy]$/.test(rule.for)) {
        add('structure', `${where}: «for: ${rule.for}» не похоже на длительность Prometheus (2m, 1h)`)
      }

      const severity = rule.labels.severity
      if (!severity) add('severity', `${where}: нет labels.severity`)
      else if (!ALLOWED_SEVERITIES.includes(severity)) {
        add('severity', `${where}: severity «${severity}» вне ${ALLOWED_SEVERITIES.join(' / ')}`)
      }

      if (!rule.annotations.summary) add('structure', `${where}: нет annotations.summary`)
      if (!rule.annotations.description) add('structure', `${where}: нет annotations.description`)

      if (rule.expr) {
        const used = metricsInExpr(rule.expr)
        if (used.length === 0) {
          add('metric-unknown', `${where}: expr «${rule.expr}» не ссылается ни на одну метрику`)
        }
        for (const name of used) {
          if (!allowed.has(name)) {
            add(
              'metric-unknown',
              `${where}: expr ссылается на «${name}», но такой метрики нет среди объявленных (# HELP/# TYPE) в ${METRICS_SOURCES.join(', ')} и среди встроенных Prometheus`,
            )
          }
        }
      }
    }
  })

  const rulePaths = ruleFilePaths(input.prometheusText ?? '')
  if (!rulePaths.includes(RULES_MOUNT)) {
    add(
      'unwired',
      `${PROMETHEUS_CONFIG} обязан подключать ${RULES_MOUNT} через rule_files (сейчас: ${rulePaths.length ? rulePaths.join(', ') : 'блока rule_files нет'})`,
    )
  }

  const mounts = composeMounts(input.composeText ?? '')
  const mount = mounts.find((m) => m.target === RULES_MOUNT)
  if (!mount) {
    add('unmounted', `${COMPOSE_FILE} обязан монтировать ${RULES_FILE} в ${RULES_MOUNT} (иначе контейнер читает пустой файл)`)
  } else if (mount.source !== RULES_FILE) {
    add('unmounted', `${COMPOSE_FILE} монтирует не тот файл: ${mount.source} → ${RULES_MOUNT}, а гейт читает ${RULES_FILE}`)
  }

  return { findings, stats: { groups: groups.length, rules: ruleCount, families: families.size, metrics: allowed.size } }
}

function readOrFail(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), 'utf8')
  } catch (err) {
    console.error(`✗ ${rel}: файл не читается (${err.code || err.message}) — гейт проверяет только существующие файлы`)
    process.exit(1)
  }
}

function main() {
  const input = {
    ruleText: readOrFail(RULES_FILE),
    prometheusText: readOrFail(PROMETHEUS_CONFIG),
    composeText: readOrFail(COMPOSE_FILE),
    metricsSources: METRICS_SOURCES.map(readOrFail),
  }

  const { findings, stats } = auditAlerts(input)

  console.log(
    `• ${RULES_FILE}: ${stats.rules} правил(о) в ${stats.groups} группах(е); объявленных семейств метрик: ${stats.families}; допустимых имён: ${stats.metrics}`,
  )

  if (findings.length > 0) {
    for (const f of findings) console.error(`✗ [${f.kind}] ${f.msg}`)
    console.error(`\nИтог: FAIL — правила алертинга разошлись с метриками или конфигом (${findings.length} находок).`)
    process.exit(1)
  }

  console.log(`\nИтог: правила алертинга целостны (${stats.rules} правил, все метрики объявлены) ✓`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
