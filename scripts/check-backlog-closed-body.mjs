// Гейт «backlog-closed-body».
//
// Правило (канон): закрытая запись в бэклоге («Что-доделать.txt») — это ОДНА компактная
// строка с ✅ и ссылкой на «Что сделано.txt». Детали закрытого живут в «Что сделано.txt»,
// а не под заголовком в бэклоге: «Здесь — только ОТКРЫТЫЕ вопросы».
//
// Канон допускает ровно ДВЕ формы закрытой записи:
//   A. строка markdown-таблицы (начинается с `|`), в ячейке которой есть ✅/ЗАКРЫТО —
//      секция при этом ОТКРЫТАЯ (заголовок без маркера закрытия) — «компактная строка»;
//   B. заголовок секции с маркером закрытия В КОНЦЕ строки (`… — ЗАКРЫТО ДД.ММ.ГГГГ`
//      или `✅` на конце), под которым идут только пустые строки и разделители `---`
//      до следующего заголовка/конца файла. Ссылка на «Что сделано.txt» — до маркера.
// Маркер НЕ в конце (например `## ✅ Принятые решения …`) — это секция-маркер,
// а не закрытие: тело под ней допустимо (ложная сработка поймана и закреплена тестом).
// Любой другой контент под закрытым заголовком: текст, блок-цитата `>`, таблица,
// список — это «надгробие с телом» = FAIL.
//
// Дополнительно — сверка с хроникой (backlog-closure-unchronicled): каждая дата
// «ЗАКРЫТО <дата>» в бэклоге обязана встречаться в «Что сделано.txt» — закрытие
// без развёрнутой записи («молчаливое удаление») = FAIL.
//
// Использование: node scripts/check-backlog-closed-body.mjs [файл...]
// (exit 0 — форма соблюдена, 1 — найдены надгробия; по умолчанию «Что-доделать.txt»)

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const HEADING_RE = /^(#{1,6})\s+(.+)$/
// Маркер закрытия признаётся ТОЛЬКО в конце строки заголовка: `… — ЗАКРЫТО ДД.ММ.ГГГГ`
// или `✅` на конце. ✅/ЗАКРЫТО в середине (`## ✅ Принятые решения …`) — это секция-маркер,
// а не закрытие: тело под ней допустимо (ложная сработка закреплена тестом).
export const CLOSED_RE = /(?:ЗАКРЫТО\s*\d{2}\.\d{2}\.\d{4}|✅)\s*$/
const HR_RE = /^---+\s*$/
export const CLOSURE_DATE_RE = /ЗАКРЫТО[^\d]{0,20}(\d{2}\.\d{2}\.\d{4})/g

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

/**
 * Сверка с хроникой: каждая дата «ЗАКРЫТО <дата>» в бэклоге обязана встречаться
 * в «Что сделано.txt» (закрытие без развёрнутой записи — «молчаливое удаление»).
 * Возвращает findings c id `backlog-closure-unchronicled`.
 */
export function auditClosureDates(lines, doneLines, file = 'Что-доделать.txt') {
  const findings = []
  const text = lines.join('\n')
  const doneText = doneLines.join('\n')
  const dates = new Set()
  let m
  CLOSURE_DATE_RE.lastIndex = 0
  while ((m = CLOSURE_DATE_RE.exec(text)) !== null) dates.add(m[1])
  for (const date of dates) {
    if (!doneText.includes(date)) {
      findings.push({
        file,
        id: 'backlog-closure-unchronicled',
        date,
        text: `дата «ЗАКРЫТО ${date}» отсутствует в «Что сделано.txt» — закрытие без развёрнутой записи`,
      })
    }
  }
  return findings
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
    } else {
      failed = true
      const n = problems.length
      const what = n === 1 ? 'строка тела' : 'строк тела'
      console.error(`✗ ${file}: ${n} ${what} под закрыт${facts.closedHeadings === 1 ? 'ым заголовком' : 'ыми заголовками'} («надгробие»):`)
      for (const p of problems) {
        console.error(`  ${p.file}:${p.line} (заголовок «${p.heading}») → ${p.text.slice(0, 120)}`)
      }
    }
    // Сверка с хроникой — только если рядом лежит «Что сделано.txt».
    const doneFile = path.join(path.dirname(file), 'Что сделано.txt')
    if (existsSync(doneFile)) {
      const doneLines = readFileSync(doneFile, 'utf8').split(/\r?\n/)
      const unchronicled = auditClosureDates(readFileSync(file, 'utf8').split(/\r?\n/), doneLines, file)
      for (const f of unchronicled) {
        failed = true
        console.error(`✗ ${f.file} (${f.id}) → ${f.text}`)
      }
      if (unchronicled.length === 0 && facts.closedHeadings === 0) {
        console.log(`  … закрытых секций нет — сверка дат не требуется`)
      }
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