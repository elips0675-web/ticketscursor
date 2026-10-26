// stage:gates — карта «изменённые файлы → обязательные гейты» (перенос идеи
// из «ЗАДАНИЕ АГЕНТУ.txt» SwiftMatch 21.10.2026, автоматизация D).
//
// Главный класс дефектов, который закрывает: правка в `server/src/routes/**`,
// а тесты сервера не прогнаны, потому что агент «не знал», что они обязательны.
// Скрипт читает git diff (рабочее дерево + staged + HEAD) и печатает список
// команд, обязательных для этой правки. Read-only.
//
// Использование:
//   npm run stage:gates              — по всем незакоммиченным изменениям
//   node scripts/stage-gates.mjs --staged   — только по staged-файлам
//   node scripts/stage-gates.mjs --committed — последний коммит (пуш-проверка)
//
// Формат вывода: каждая строка `PATH → команда`; в конце «ИТОГО» (все
// обязательные) и «РЕКОМЕНДОВАНО» (опциональные, требуют живого стенда).

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Карта «маска пути → обязательные гейты». Порядок — от специфичного к общему,
 * первое сработавшее правило добавляет свои команды (несколько правил могут
 * сработать на один файл — например, миграция попадает и в migrations-lag,
 * и в серверные тесты).
 */
export const GATE_RULES = [
  { re: /^server\/migrations\//, gates: ['npm run check:migrations-lag', 'npm run check:schema-drift', 'cd server && npm test'], why: 'миграции: лаг схемы + дрейф Prisma + серверные тесты' },
  { re: /^server\/prisma\//, gates: ['npm run check:migrations-lag', 'npm run check:schema-drift', 'cd server && npm test'], why: 'schema.prisma: лаг схемы + дрейф + серверные тесты' },
  { re: /^server\/(seed\.sql|test-db-setup\.js)$/, gates: ['npm run check:schema-drift'], why: 'вторая копия схемы (seed/харнесс): сверка с Prisma' },
  { re: /^server\/src\//, gates: ['cd server && npm test'], why: 'серверный код: серверные тесты' },
  { re: /^server\/(vitest\.config|package)/, gates: ['cd server && npm test'], why: 'конфиг сервера: серверные тесты' },
  { re: /^src\/.*\.(ts|tsx)$/, gates: ['npm test', 'npm run build'], why: 'фронт: клиентские тесты + сборка' },
  { re: /^(scripts|check-console\.mjs)\/?.*\.(mjs|ts)$/, gates: ['npm test'], why: 'скрипты гейтов покрыты клиентским vitest (scripts/**/*.test.mjs)' },
  { re: /^e2e\//, gates: ['npx playwright test'], why: 'E2E-спеки: прогон Playwright' },
  { re: /\.(md|txt)$/, gates: ['npm run check:docs'], why: 'доки/журналы: зеркала, счётчики, структура бэклога' },
  { re: /^(nginx\.conf|vercel\.json)$/, gates: ['npm run check:headers'], why: 'периметр: security-заголовки' },
  { re: /^(docker-compose|Dockerfile|\.dockerignore)/, gates: ['npm run check:headers', 'npm run check:compose-logging'], why: 'контейнер: заголовки периметра + лимиты логов и retention тома' },
  { re: /^(package\.json|package-lock\.json|server\/package(-lock)?\.json)$/, gates: ['npm test', 'cd server && npm test'], why: 'зависимости: оба набора тестов' },
]

/** Рекомендации, требующие живого стенда (не входят в обязательный итог). */
export const ADVISORY = [
  { re: /^src\//, cmd: 'npm run check:console', why: 'консоль браузера (нужен preview 8081 + API 3002)' },
  { re: /^(src|server\/src)\//, cmd: 'npm run check:menu / check:alerts', why: 'инвентарь меню и алерты (если трогали меню/метрики)' },
]

export function gatesForFile(file) {
  const hits = []
  for (const rule of GATE_RULES) {
    if (rule.re.test(file)) hits.push(...rule.gates)
  }
  return [...new Set(hits)]
}

export function advisoriesForFile(file) {
  const out = []
  for (const a of ADVISORY) if (a.re.test(file)) out.push(`${a.cmd} — ${a.why}`)
  return out
}

function changedFiles(mode) {
  const args =
    mode === 'staged'
      ? ['diff', '--cached', '--name-only']
      : mode === 'committed'
        ? ['show', '--name-only', '--format=']
        : ['status', '--porcelain']
  let out
  try {
    out = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  } catch {
    console.log('(git недоступен)')
    process.exit(1)
  }
  return out
    .split(/\r?\n/)
    .map((l) => (mode === 'unstaged' ? l.slice(3) : l))
    .map((l) => l.trim())
    .filter(Boolean)
}

function main() {
  const mode = process.argv.includes('--staged') ? 'staged' : process.argv.includes('--committed') ? 'committed' : 'unstaged'
  const files = [...new Set(changedFiles(mode))]
  if (files.length === 0) {
    console.log('Нет незакоммиченных изменений (или последний коммит пуст) — гейты по файлам не определяются.')
    return
  }
  console.log(`Изменённые файлы (${mode}, ${files.length}):`)
  const all = new Set()
  const advisory = new Set()
  for (const f of files) {
    const gates = gatesForFile(f)
    const adv = advisoriesForFile(f)
    gates.forEach((g) => all.add(g))
    adv.forEach((a) => advisory.add(a))
    console.log(`  ${f}`)
    if (gates.length > 0) console.log(`      → ${gates.join(' ; ')}`)
    if (adv.length > 0) console.log(`      ~ ${adv.join(' ; ')}`)
  }
  console.log('\nИТОГО (обязательно):')
  if (all.size === 0) console.log('  (для этих файлов обязательных гейтов нет)')
  for (const g of all) console.log(`  - ${g}`)
  console.log('\nРЕКОМЕНДОВАНО (живой стенд / по ситуации):')
  for (const a of advisory) console.log(`  - ${a}`)
  console.log('  - npm run check:console — перед «готово», если трогали UI')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
