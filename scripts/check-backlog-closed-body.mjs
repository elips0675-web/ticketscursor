// Гейт «backlog-closed-body».
//
// Правило (канон): закрытая запись в бэклоге («Что-доделать.txt») — это ОДНА компактная
// строка с ✅ и ссылкой на «Что сделано.txt». Детали закрытого живут в «Что сделано.txt»,
// а не под заголовком в бэклоге: «Здесь — только ОТКРЫТЫЕ вопросы».
//
// Канон допускает ровно ДВЕ формы закрытой записи:
//   A. строка markdown-таблицы (начинается с `|`), в ячейке которой есть ✅/ЗАКРЫТО —
//      секция при этом ОТКРЫТАЯ (заголовок без ✅/ЗАКРЫТО) — «компактная строка»;
//   B. заголовок секции, содержащий ✅ ИЛИ ЗАКРЫТО, под которым идут только пустые
//      строки и разделители `---` до следующего заголовка/конца файла.
// Любой другой контент под закрытым заголовком: текст, блок-цитата `>`, таблица,
// список — это «надгробие с телом» = FAIL.
//
// Использование: node scripts/check-backlog-closed-body.mjs [файл...]
// (exit 0 — форма соблюдена, 1 — найдены надгробия; по умолчанию «Что-доделать.txt»)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const HEADING_RE = /^(#{1,6})\s+(.+)$/
export const CLOSED_RE = /(?:✅|ЗАКРЫТО)/
const HR_RE = /^---+\s*$/

export function auditLines(lines, file = 'Что-доделать.txt') {
  const problems = []
  let closedHeadings = 0
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(HEADING_RE)
    if (!m) {
      i++
      continue
    }
    const [, , heading] = m
    if (!CLOSED_RE.test(heading)) {
      i++
      continue
    }
    closedHeadings++
    // Тело закрытой секции: до следующего заголовка или конца файла.
    let j = i + 1
    while (j < lines.length && !HEADING_RE.test(lines[j])) {
      const line = lines[j].trim()
      if (line === '' || HR_RE.test(line)) {
        j++
        continue
      }
      problems.push({
        file,
        line: j + 1,
        heading,
        text: line,
      })
      j++
    }
    i = j
  }
  return { problems, facts: { closedHeadings } }
}

export function auditFile(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  return auditLines(lines, file)
}

function main() {
  const targets = process.argv.slice(2)
  if (targets.length === 0) {
    targets.push(path.resolve(import.meta.dirname, '..', 'Что-доделать.txt'))
  }
  let failed = false
  for (const file of targets) {
    const { problems, facts } = auditFile(file)
    if (problems.length === 0) {
      console.log(`✓ ${file} — закрытые записи без тела (${facts.closedHeadings} закрытых секций)`)
      continue
    }
    failed = true
    const n = problems.length
    const what = n === 1 ? 'строка тела' : 'строк тела'
    console.error(`✗ ${file}: ${n} ${what} под закрыт${facts.closedHeadings === 1 ? 'ым заголовком' : 'ыми заголовками'} («надгробие»):`)
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line} (заголовок «${p.heading}») → ${p.text.slice(0, 120)}`)
    }
  }
  if (failed) {
    console.error('\nИтог: FAIL. Закрытая запись = одна компактная строка ✅ + ссылка на «Что сделано.txt».')
    process.exit(1)
  }
  console.log('\nИтог: форма закрытых записей соблюдена ✓')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}