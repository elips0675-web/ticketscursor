// Гейт «backlog-schema» (структурный канон бэклога, 17.10.2026).
//
// «Что-доделать.txt» читают внешние аудиторы, и у него два известных класса дефектов:
// ссылки, которые ломаются при вставках, и строки, у которых «съезжают» колонки.
// Гейт превращает оба класса в красноту CI вместо надежды на внимательность.
//
// Пять проверок:
//   1. backlog-max-lines — лимит объёма: 450 строк / 90 000 байт. Бэклог-хроника
//      раздувается незаметно (в SwiftMatch файл перевалил за 1500 строк и перестал
//      быть бэклогом); лимит делает рост видимым заранее, а не в отчёте аудитора.
//   2. ID-колонка — таблицы с заголовком `| ID |` несут стабильные ID (`P1-08`,
//      `RLS-03`; legacy `G1`/`Z8`): формат строгий, ID уникален во всём файле.
//      Ссылки вида «P1 №9» ломались дважды: внешний аудит утверждал «P1 №9 —
//      мобильная навигация», тогда как в бэклоге P1 №9 — утечка секретов.
//   3. Целостность столбцов — число ячеек строки равно числу ячеек шапки. Сдвиг
//      колонок прячет статус: так выглядели битые строки CON-03 и RLS-06 до починки
//      (✅-статус утёк в ячейку «Факт», лишний ⏳ — в таблицу без столбца «Статус»).
//   4. Статусный префикс — в таблицах со столбцом «Статус» ячейка начинается с
//      ⏳ (открыто) / ✅ (закрыто) / — (не применимо): состояние отличимо от прозы.
//   5. Даты у P1 — открытая строка секции «ВАЖНО (P1)» несёт «(проверено ДД.ММ.ГГГГ)»,
//      закрытая — «✅ ДД.ММ.ГГГГ». Пункт без даты проверки не отличим от протухшего
//      (та же ловушка, что «шапка жила с 1009 при факте 1245»).
//
// Использование: node scripts/check-backlog-schema.mjs [файл]
//   exit 0 — схема соблюдена; 1 — есть нарушения (каждое печатается с номером строки).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_LINES = 450
export const MAX_BYTES = 90000
export const ID_RE = /^(?:[A-Z][A-Z0-9]{0,3}-\d{2}|[A-Z]\d{1,2})$/
export const STATUS_PREFIX_RE = /^(?:⏳|✅|—)(?:\s|$)/
export const P1_VERIFIED_RE = /\(проверено \d{2}\.\d{2}\.\d{4}\)/
export const P1_CLOSED_RE = /^✅ \d{2}\.\d{2}\.\d{4}/
const SEPARATOR_RE = /^\|(?:\s*:?-+:?\s*\|)+$/
const P1_HEADING_RE = /ВАЖНО \(P1\)/

export function splitRow(line) {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim())
}

export function headingAbove(lines, index) {
  for (let i = index; i >= 0; i--) {
    if (/^#{1,6} /.test(lines[i])) return lines[i]
  }
  return ''
}

export function auditBacklog(text) {
  const problems = []
  const lines = text.split(/\r?\n/)
  const lastIsTrailer = lines.length > 0 && lines[lines.length - 1] === ''
  const lineCount = lastIsTrailer ? lines.length - 1 : lines.length
  const bytes = Buffer.byteLength(text, 'utf8')
  if (lineCount > MAX_LINES) problems.push(`объём: ${lineCount} строк (лимит ${MAX_LINES})`)
  if (bytes > MAX_BYTES) problems.push(`объём: ${bytes} байт (лимит ${MAX_BYTES})`)

  const seen = new Map()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('|')) continue
    const prev = lines[i - 1] ?? ''
    const next = lines[i + 1] ?? ''
    if (prev.startsWith('|') || !SEPARATOR_RE.test(next)) continue
    const header = splitRow(line)
    const idCol = header.indexOf('ID')
    const statusCol = header.indexOf('Статус')
    const isP1 = P1_HEADING_RE.test(headingAbove(lines, i))
    let j = i + 2
    while (j < lines.length && lines[j].startsWith('|') && !SEPARATOR_RE.test(lines[j])) {
      const cells = splitRow(lines[j])
      const where = `строка ${j + 1}`
      if (cells.length !== header.length) {
        problems.push(`${where}: ячеек ${cells.length} при шапке ${header.length} («${cells[0] || ''}»)`)
      } else {
        if (idCol === 0) {
          const id = cells[0]
          if (!ID_RE.test(id)) {
            problems.push(`${where}: ID «${id}» не формата PREFIX-NN / G1 (колонка ID)`)
          } else if (seen.has(id)) {
            problems.push(`${where}: ID «${id}» уже встречался в строке ${seen.get(id)}`)
          } else {
            seen.set(id, j + 1)
          }
        }
        if (statusCol >= 0) {
          const status = cells[statusCol]
          if (!STATUS_PREFIX_RE.test(status)) {
            problems.push(`${where} (${cells[0]}): статус «${status.slice(0, 40)}» не начинается с ⏳/✅/—`)
          } else if (isP1) {
            if (status.startsWith('⏳') && !P1_VERIFIED_RE.test(status)) {
              problems.push(`${where} (${cells[0]}): открытая P1-строка без «(проверено ДД.ММ.ГГГГ)»`)
            }
            if (status.startsWith('✅') && !P1_CLOSED_RE.test(status)) {
              problems.push(`${where} (${cells[0]}): закрытая P1-строка без даты «✅ ДД.ММ.ГГГГ» в начале статуса`)
            }
          }
        }
      }
      j++
    }
    i = j - 1
  }
  return problems
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'Что-доделать.txt')
  const text = readFileSync(target, 'utf8')
  const problems = auditBacklog(text)
  const lines = text.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ''))
  const ids = new Set()
  for (const line of lines) {
    if (!line.startsWith('|')) continue
    const first = splitRow(line)[0]
    if (ID_RE.test(first)) ids.add(first)
  }
  console.log(
    `Схема бэклога: ${path.relative(ROOT, target) || target} — строк ${lines.length}, ` +
      `байт ${Buffer.byteLength(text, 'utf8')}, ID ${ids.size}`,
  )
  if (problems.length === 0) {
    console.log('Итог: схема соблюдена ✓')
    return
  }
  for (const problem of problems) console.error(`✗ ${problem}`)
  console.error(`\nИтог: FAIL (${problems.length}). Схема: лимит ${MAX_LINES} строк/${MAX_BYTES} байт, ` +
    'ID без дублей, целостность столбцов, статусный префикс, даты у открытых P1.')
  process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
