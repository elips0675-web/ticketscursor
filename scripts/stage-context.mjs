// stage:context — быстрый старт сессии/этапа (перенос идеи из «ЗАДАНИЕ АГЕНТУ.txt»
// SwiftMatch 21.10.2026, автоматизация A).
//
// Одна команда печатает контекст, который агент и так собирал бы вручную
// 10–15 минут: состояние git, счётчики тестов, открытые этапы очереди
// и последние записи журнала «Что сделано.txt». Read-only: ничего не пишет
// и не меняет — только читает и печатает.
//
// Использование:
//   npm run stage:context        (или node scripts/stage-context.mjs)
//
// Блоки вывода:
//   1. git: status --short + log --oneline -3;
//   2. счётчики из test-analysis/test-inventory.json (факт последней регенерации);
//   3. открытые этапы «ПЛАН ДОРАБОТКИ ПО ЭТАПАМ» из «Что-доделать.txt»;
//   4. последние 3 записи «### Этап …» из «Что сделано.txt».

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Парсер строк таблицы этапов: `| **66** | …задача… | ⏳ …статус… |`. */
export function parseOpenStages(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^##\s+ПЛАН ДОРАБОТКИ ПО ЭТАПАМ/.test(l))
  if (start < 0) return []
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) break
    // Ячейки таблицы экранируют `|` как `\|` (внутри задач много маршрутов
    // вида `/approve\|reject`) — split по «голому» | сдвигал колонку статуса.
    const cells = lines[i].split(/(?<!\\)\|/).map((c) => c.trim())
    if (cells.length < 4) continue
    const id = /^\*{0,2}(\d+)\*{0,2}$/.exec(cells[1] ?? '')
    if (!id) continue
    const task = cells[2].replace(/\*{2}/g, '')
    const status = cells[3].replace(/\*{2}/g, '')
    out.push({
      stage: Number(id[1]),
      task: task.length > 70 ? `${task.slice(0, 70)}…` : task,
      status: status.slice(0, 90),
      closed: status.startsWith('✅') && !status.includes('⏳'),
    })
  }
  return out
}

/** Последние записи журнала: заголовки `### Этап N …` из «Что сделано.txt». */
export function lastStageEntries(text, count = 3) {
  const lines = text.split(/\r?\n/)
  const hs = []
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4}\s+Этап\s+\d+/.test(lines[i]) || /^#{2,4}\s+\S.*\(\d{2}\.\d{2}\.\d{4}\)/.test(lines[i])) {
      hs.push({ line: i + 1, title: lines[i].replace(/^#{2,4}\s+/, '').slice(0, 90) })
    }
  }
  return hs.slice(-count)
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd()
  } catch {
    return '(git недоступен)'
  }
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    return null
  }
}

function section(title) {
  console.log(`\n== ${title} ==`)
}

function main() {
  console.log('== git status --short ==')
  const status = git(['status', '--short'])
  console.log(status || '(дерево чистое)')
  section('git log --oneline -3')
  console.log(git(['log', '--oneline', '-3']))

  section('Счётчики тестов (test-analysis/test-inventory.json)')
  try {
    const inv = JSON.parse(read('test-analysis/test-inventory.json') ?? '{}')
    const c = inv.client ?? inv.frontend
    const gen = (inv.generated ?? '').slice(0, 10)
    if (c && inv.server) {
      console.log(`клиент ${c.files} файлов / ${c.tests} тестов; сервер ${inv.server.files} / ${inv.server.tests}; e2e ${inv.e2e?.files ?? '?'} / ${inv.e2e?.tests ?? '?'} — всего ${inv.total?.tests ?? '?'}; generated ${gen}`)
    } else {
      console.log('(инвентарь не читается)')
    }
  } catch {
    console.log('(инвентарь не читается)')
  }

  section('Открытые этапы («Что-доделать.txt» → ПЛАН ДОРАБОТКИ)')
  const backlog = read('Что-доделать.txt')
  if (backlog) {
    const stages = parseOpenStages(backlog)
    const open = stages.filter((s) => !s.closed)
    if (open.length === 0) console.log('(открытых этапов нет — все строки со ✅)')
    for (const s of open) console.log(`Этап ${s.stage}: ${s.task}\n    статус: ${s.status}`)
    const done = stages.length - open.length
    if (done > 0) console.log(`(закрытых строк плана: ${done})`)
  } else {
    console.log('(«Что-доделать.txt» не найден)')
  }

  section('Последние записи «Что сделано.txt»')
  const journal = read('Что сделано.txt')
  if (journal) {
    for (const e of lastStageEntries(journal)) console.log(`строка ${e.line}: ${e.title}`)
  } else {
    console.log('(«Что сделано.txt» не найден)')
  }
  console.log('')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
