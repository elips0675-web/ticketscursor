// Гейт «doc-counters» (процесс №5 «Что-доделать.txt»).
//
// Правило: числа тестов в шапках документов — это НЕ «ручные цифры», а факт из
// `test-analysis/test-inventory.json` (регенерируется реальным прогоном vitest,
// см. `scripts/regenerate-test-inventory.js`). Любое расхождение шапки с
// инвентарём — FAIL: цифра устарела молча и перепечаталась в оценку.
//
// Мишени (процесс №8: «включить README/TECHNICAL/PLAYBOOK в мишени гейта»):
//   Что-доделать.txt, Что сделано.txt, README.md, TECHNICAL.md, PLAYBOOK.md, AGENTS.md.
// Проверяются только ЖИВЫЕ шапки (конкретные фразы), а не исторические записи
// «Что сделано.txt» (в летописи числа у прошлых этапов законно старые).
//
// Использование:
//   node scripts/check-doc-counters.mjs          — проверить (exit 1 при расхождении)
//   node scripts/check-doc-counters.mjs --fix    — проставить актуальные числа
//
// Зеркала `test-analysis/` гейт НЕ трогает: их побайтовую синхронность держит
// `scripts/check-doc-sync.mjs` — после `--fix` синхронизировать зеркала там же.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Числа-факт из инвентаря тестов (единственный источник правды для шапок). */
export function loadCounts(root = ROOT) {
  const inv = JSON.parse(readFileSync(path.join(root, 'test-analysis', 'test-inventory.json'), 'utf8'))
  return {
    clientFiles: inv.frontend.files,
    clientTests: inv.frontend.tests,
    serverFiles: inv.server.files,
    serverTests: inv.server.tests,
    totalFiles: inv.total.files,
    totalTests: inv.total.tests,
    e2eFiles: inv.e2e.files,
    e2eTests: inv.e2e.tests,
  }
}

/**
 * Мишени. `re` — фраза-шаблон с числовыми группами в порядке `values(c)`.
 * Флаг `d` даёт индексы групп для точечной правки. Дата в шаблоне (например
 * «факт 11.10.2026») НЕ захватывается — она остаётся как есть.
 */
export function specs(c) {
  return [
    {
      file: 'Что-доделать.txt',
      id: 'header',
      re: /Тесты \(факт \d{2}\.\d{2}\.\d{4}\): клиент (\d+) файлов \/ (\d+) \+ сервер (\d+) файлов \/ (\d+) = \*\*(\d+) тестов, 0 failures\*\*/d,
      values: () => [c.clientFiles, c.clientTests, c.serverFiles, c.serverTests, c.totalTests],
    },
    {
      file: 'Что-доделать.txt',
      id: 'header-e2e',
      re: /E2E (\d+) spec \/ (\d+) \+ check-console \d+\/\d+/d,
      values: () => [c.e2eFiles, c.e2eTests],
    },
    {
      file: 'Что-доделать.txt',
      id: 'header-inventory',
      re: /— (\d+) файлов \/ (\d+) тестов\)/d,
      values: () => [c.totalFiles, c.totalTests],
    },
    {
      file: 'Что-доделать.txt',
      id: 'summary',
      re: /Факт на \d{2}\.\d{2}: \*\*(\d+) тестов, 0 failures\*\* \(клиент (\d+)\/(\d+); сервер (\d+)\/(\d+);/d,
      values: () => [c.totalTests, c.clientFiles, c.clientTests, c.serverFiles, c.serverTests],
    },
    {
      file: 'Что сделано.txt',
      id: 'header',
      re: /(\d+) тестов \/ 0 failures \(клиент (\d+)\/(\d+), сервер (\d+)\/(\d+)\), E2E (\d+) spec \/ (\d+) тест/d,
      values: () => [c.totalTests, c.clientFiles, c.clientTests, c.serverFiles, c.serverTests, c.e2eFiles, c.e2eTests],
    },
    {
      file: 'README.md',
      id: 'risk-table',
      re: /(\d+) client \/ (\d+) server \/ (\d+) E2E \((\d+), 0 failures\)/d,
      values: () => [c.clientTests, c.serverTests, c.e2eTests, c.totalTests],
    },
    {
      file: 'README.md',
      id: 'client-row',
      re: /Клиентские тесты \| (\d+) тестов, (\d+) файлов \|/d,
      values: () => [c.clientTests, c.clientFiles],
    },
    {
      file: 'README.md',
      id: 'server-row',
      re: /Серверные тесты \| (\d+) теста, (\d+) файлов \|/d,
      values: () => [c.serverTests, c.serverFiles],
    },
    {
      file: 'README.md',
      id: 'e2e-row',
      re: /E2E тесты \(Playwright\) \| (\d+) spec'ов, (\d+) тест;/d,
      values: () => [c.e2eFiles, c.e2eTests],
    },
    {
      file: 'TECHNICAL.md',
      id: 'note',
      re: /(\d+) клиентских \/ (\d+) серверных \/ (\d+) E2E тестов \(=(\d+), 0 failures/d,
      values: () => [c.clientTests, c.serverTests, c.e2eTests, c.totalTests],
    },
    {
      file: 'PLAYBOOK.md',
      id: 'pyramid-unit',
      re: /(\d+) frontend \+ (\d+) backend = (\d+) tests \(0 failures\)/d,
      values: () => [c.clientTests, c.serverTests, c.totalTests],
    },
    {
      file: 'PLAYBOOK.md',
      id: 'pyramid-e2e',
      re: /(\d+) Playwright spec'ов \/ (\d+) тест/d,
      values: () => [c.e2eFiles, c.e2eTests],
    },
    {
      file: 'AGENTS.md',
      id: 'unit-tests',
      re: /(\d+) клиентских \+ (\d+) серверных/d,
      values: () => [c.clientTests, c.serverTests],
    },
  ]
}

/** Сгруппировать мишени по файлу (сохраняя порядок). */
export function groupByFile(allSpecs) {
  const map = new Map()
  for (const s of allSpecs) {
    if (!map.has(s.file)) map.set(s.file, [])
    map.get(s.file).push(s)
  }
  return map
}

/** Все совпадения шаблона с индексами групп (нужен флаг `d`). */
function scan(text, spec) {
  const flags = spec.re.flags.includes('g') ? spec.re.flags : spec.re.flags + 'g'
  const re = new RegExp(spec.re.source, flags)
  const out = []
  let m
  while ((m = re.exec(text)) !== null) {
    out.push({ index: m.index, full: m[0], groups: m.slice(1), indices: m.indices.slice(1) })
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return out
}

function lineNumberAt(text, index) {
  let n = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') n++
  return n
}

/**
 * Проверка текста файла против факта. Возвращает findings:
 *  - `missing`      — фраза-шаблон не найдена (структуру строки переписали);
 *  - `ambiguous`    — фраза найдена больше одного раза (непонятно, что чинить);
 *  - `stale`        — число в фразе не совпало с инвентарём (file:line + было/стало).
 */
export function auditText(text, fileSpecs, c) {
  const findings = []
  for (const spec of fileSpecs) {
    const expected = spec.values(c).map(String)
    const matches = scan(text, spec)
    if (matches.length === 0) {
      findings.push({ file: spec.file, id: spec.id, kind: 'missing', expected })
      continue
    }
    if (matches.length > 1) {
      findings.push({ file: spec.file, id: spec.id, kind: 'ambiguous', count: matches.length, expected })
      continue
    }
    const m = matches[0]
    for (let i = 0; i < expected.length; i++) {
      if (m.groups[i] !== expected[i]) {
        findings.push({
          file: spec.file,
          id: spec.id,
          kind: 'stale',
          line: lineNumberAt(text, m.index),
          found: m.groups[i],
          expected: expected[i],
        })
      }
    }
  }
  return findings
}

/** Точечная правка: числовые группы заменяются фактом, текст вокруг — нет. */
export function fixText(text, fileSpecs, c) {
  let out = text
  let changed = 0
  for (const spec of fileSpecs) {
    const matches = scan(out, spec)
    if (matches.length !== 1) continue
    const expected = spec.values(c).map(String)
    const m = matches[0]
    let replaced = m.full
    for (let i = m.indices.length - 1; i >= 0; i--) {
      const start = m.indices[i][0] - m.index
      const end = m.indices[i][1] - m.index
      replaced = replaced.slice(0, start) + expected[i] + replaced.slice(end)
    }
    if (replaced !== m.full) {
      changed++
      out = out.slice(0, m.index) + replaced + out.slice(m.index + m.full.length)
    }
  }
  return { text: out, changed }
}

function main() {
  const fix = process.argv.includes('--fix')
  const c = loadCounts()
  const expectedSummary = `клиент ${c.clientFiles}/${c.clientTests}, сервер ${c.serverFiles}/${c.serverTests}, E2E ${c.e2eFiles}/${c.e2eTests}, всего ${c.totalTests}`
  console.log(`Факт из test-analysis/test-inventory.json: ${expectedSummary}`)

  const byFile = groupByFile(specs(c))
  let failed = false

  for (const [file, fileSpecs] of byFile) {
    const abs = path.join(ROOT, file)
    const text = readFileSync(abs, 'utf8')
    if (fix) {
      const { text: fixed, changed } = fixText(text, fileSpecs, c)
      if (changed > 0) {
        writeFileSync(abs, fixed, 'utf8')
        console.log(`✎ ${file} — исправлено счётчиков: ${changed}`)
      } else {
        console.log(`✓ ${file} — актуально`)
      }
      continue
    }
    const findings = auditText(text, fileSpecs, c)
    if (findings.length === 0) {
      console.log(`✓ ${file} — ${fileSpecs.length} шаблон(ов) совпали с инвентарём`)
      continue
    }
    failed = true
    for (const f of findings) {
      if (f.kind === 'missing') {
        console.error(`✗ ${f.file} [${f.id}] — фраза-шаблон не найдена (ожидались числа: ${f.expected.join(', ')})`)
      } else if (f.kind === 'ambiguous') {
        console.error(`✗ ${f.file} [${f.id}] — фраза найдена ${f.count} раз, правка неоднозначна`)
      } else {
        console.error(`✗ ${f.file}:${f.line} [${f.id}] — устаревшее число «${f.found}», ожидалось «${f.expected}»`)
      }
    }
  }

  if (fix) {
    console.log('\nИтог: --fix применён. Синхронизировать зеркала: node scripts/check-doc-sync.mjs')
    return
  }
  if (failed) {
    console.error('\nИтог: FAIL. Числа тестов в шапках разошлись с инвентарём. Починить: node scripts/check-doc-counters.mjs --fix')
    process.exit(1)
  }
  console.log('\nИтог: счётчики в шапках совпадают с инвентарём ✓')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
