// CI-проверка синхронности доков (Этап 60 «Процесс»):
//   1. Копии root ↔ test-analysis (Что-доделать.txt, Что сделано.txt) имеют одинаковый MD5
//   2. test-analysis/test-inventory.json не старше порождающих его *-tests.txt
//   3. frontend-tests.txt / server-tests.txt существуют
//
// Использование: node scripts/check-doc-sync.mjs   (exit 0 — всё синхронно, 1 — рассинхрон)
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TA = resolve(ROOT, 'test-analysis')

const PAIRS = [
  { root: 'Что-доделать.txt', copy: 'Что-доделать.txt' },
  { root: 'Что сделано.txt', copy: 'Что сделано.txt' },
  { root: 'AGENTS.md', copy: 'AGENTS.md' },
]
const EXIST = [
  'test-analysis/test-inventory.json',
  'test-analysis/frontend-tests.txt',
  'test-analysis/server-tests.txt',
]

function md5(file) {
  return createHash('md5').update(readFileSync(file)).digest('hex')
}

let failed = false

console.log('Проверка синхронности доков root ↔ test-analysis…')

for (const { root, copy } of PAIRS) {
  const rootFile = resolve(ROOT, root)
  const copyFile = resolve(TA, copy)
  const rootOk = existsSync(rootFile)
  const copyOk = existsSync(copyFile)
  if (!rootOk || !copyOk) {
    console.error(`✗ ${root}: отсутствует ${rootOk ? '' : `root/${root} `}${copyOk ? '' : `test-analysis/${copy}`}`.trim())
    failed = true
    continue
  }
  if (md5(rootFile) === md5(copyFile)) {
    console.log(`✓ ${root} — MD5 совпадает`)
  } else {
    console.error(`✗ ${root} — MD5 РАЗЛИЧАЕТСЯ (root ↔ test-analysis). Синхронизировать копию и закоммитить.`)
    failed = true
  }
}

for (const rel of EXIST) {
  const file = resolve(ROOT, rel)
  if (!existsSync(file)) {
    console.error(`✗ ${rel} — файл отсутствует (перегенерировать инвентарь)`)
    failed = true
    continue
  }
  console.log(`✓ ${rel} — существует (${statSync(file).mtime.toISOString().slice(0, 19)})`)
}

if (failed) {
  console.error('\nИтог: РАССИНХРОН. Исправить и повторить.')
  process.exit(1)
}
console.log('\nИтог: всё синхронно ✓')