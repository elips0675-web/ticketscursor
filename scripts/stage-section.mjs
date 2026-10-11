// Инструмент «стадии» записей в бэклоге («Что-доделать.txt»).
//
// Канон формы закрытой записи (задокументирован в scripts/check-backlog-closed-body.mjs):
// закрытая запись = ОДНА компактная строка `## ✅ <заголовок> — ЗАКРЫТО <дата> — см. «Что
// сделано.txt»`. Тело под закрытым заголовком («надгробие») запрещено.
//
// Инструмент отказывается производить плохую форму:
//   * `close` с `--body`  → exit 1, ничего не записано (закрытая запись не имеет тела);
//   * любой заголовок, содержащий ✅/ЗАКРЫТО, с телом → exit 1;
//   * после сборки новая версия файла прогоняется через тот же гейт
//     (check-backlog-closed-body) — если бы инструмент умел писать надгробие,
//     гейт бы его не пропустил. Строки таблиц (форма A) инструмент не трогает.
//
// Использование:
//   node scripts/stage-section.mjs close --file "Что-доделать.txt" \
//       --title "P1 №13: routes/admin.js coverage" --date "11.10.2026" \
//       --ref "раздел «P1 №13 — routes/admin.js coverage», 11.10"
//   node scripts/stage-section.mjs open --file "Что-доделать.txt" \
//       --title "Новая открытая тема" --body "строка 1\nстрока 2"
//
// `close` вставляет компактную строку сразу после первого `---` (зона закрытых записей
// под шапкой), `open` — в конец файла перед финальным `---`.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { auditLines, CLOSED_RE } from './check-backlog-closed-body.mjs'

const DEFAULT_FILE = path.resolve(import.meta.dirname, '..', 'Что-доделать.txt')
const TODAY = new Date()
const DEFAULT_DATE = `${String(TODAY.getDate()).padStart(2, '0')}.${String(TODAY.getMonth() + 1).padStart(2, '0')}.${TODAY.getFullYear()}`

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

export function buildClosedLine({ title, date = DEFAULT_DATE, ref = '' }) {
  const refSuffix = ref ? ` — см. «Что сделано.txt»: ${ref}` : ' — см. «Что сделано.txt»'
  return `## ✅ ${title.trim()} — ЗАКРЫТО ${date}${refSuffix}`
}

export function buildOpenSection({ title, body = '' }) {
  const trimmed = body.trim()
  return `## ${title.trim()}\n\n${trimmed}\n`
}

/**
 * Вставка в файл. Всегда прогоняет аудит результата: если получившаяся форма
 * нарушает канон (закрытая секция с телом) — бросает ошибку, файл не трогается.
 */
export function stage(entries, file = DEFAULT_FILE, { dryRun = false } = {}) {
  let text = readFileSync(file, 'utf8')
  for (const entry of entries) {
    if (entry.mode === 'close') {
      if (entry.body && entry.body.trim() !== '') {
        throw new Error('stage-section: ЗАКРЫТАЯ запись не может иметь тело («надгробие» запрещено каноном). Уберите --body или сделайте запись открытой (open).')
      }
      if (CLOSED_RE.test(entry.title) && entry.body && entry.body.trim() !== '') {
        throw new Error('stage-section: заголовок с ✅/ЗАКРЫТО не может иметь тело.')
      }
      text = insertAfterFirstHr(text, buildClosedLine(entry) + '\n')
    } else {
      if (CLOSED_RE.test(entry.title) && entry.body && entry.body.trim() !== '') {
        throw new Error('stage-section: заголовок с ✅/ЗАКРЫТО не может иметь тело.')
      }
      text = appendOpen(text, buildOpenSection(entry))
    }
  }
  const { problems } = auditLines(text.split(/\r?\n/), file)
  if (problems.length > 0) {
    throw new Error(
      `stage-section: результирующий файл нарушает канон (${problems.length} «надгробий»), запись отменена: ` +
        problems.map((p) => `${file}:${p.line}`).join(', '),
    )
  }
  if (!dryRun) {
    writeFileSync(file, text, 'utf8')
  }
  return text
}

/** Вставка текста сразу после первого `---` (зона закрытых записей под шапкой). */
function insertAfterFirstHr(text, block) {
  const lines = text.split('\n')
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^---+\s*$/.test(lines[i])) {
      idx = i
      break
    }
  }
  if (idx === -1) {
    // Нет разделителя — добавляем в самый конец.
    return text.replace(/\s*$/, '\n') + block
  }
  lines.splice(idx + 1, 0, '', block.replace(/\n$/, ''))
  return lines.join('\n')
}

/** Открытая секция — в конец файла перед финальным `---` (или в самый конец). */
function appendOpen(text, block) {
  const lines = text.split('\n')
  // Убираем финальный `---` (и хвостовые пустые строки), чтобы вставить перед ним.
  let end = lines.length
  while (end > 0 && (lines[end - 1].trim() === '' || /^---+\s*$/.test(lines[end - 1].trim()))) {
    end--
  }
  const head = lines.slice(0, end).join('\n')
  return `${head.replace(/\s*$/, '')}\n\n---\n\n${block}`
}

function main() {
  const argv = process.argv.slice(2)
  const [mode] = argv
  if (mode !== 'close' && mode !== 'open') {
    console.error('Использование: node scripts/stage-section.mjs <close|open> --file <путь> --title <заголовок> [--date DD.MM.YYYY] [--ref ...] [--body ...] [--dry-run]')
    process.exit(2)
  }
  const args = parseArgs(argv.slice(1))
  const file = args.file || DEFAULT_FILE
  try {
    const entry = {
      mode,
      title: args.title || '',
      body: typeof args.body === 'string' ? args.body : undefined,
      date: args.date,
      ref: typeof args.ref === 'string' ? args.ref : '',
    }
    if (!entry.title.trim()) {
      throw new Error('stage-section: --title обязателен.')
    }
    stage([entry], file, { dryRun: Boolean(args['dry-run']) })
    console.log(`✓ ${mode === 'close' ? 'закрыта' : 'открыта'} запись «${entry.title}» в ${file}`)
    if (args['dry-run']) {
      console.log('  (dry-run: файл не изменён)')
    } else {
      console.log('  Не забудь: синхронизировать зеркало test-analysis/ и прогнать check-doc-sync.')
    }
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}