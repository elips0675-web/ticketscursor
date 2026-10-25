// check:lint-gate — гейт на сам гейт линтера.
//
// Дефект, который закрывает: `--max-warnings 100` при факте 0 предупреждений
// пропускает до 100 новых молча — «зелёный» линтер перестаёт что-либо значить.
// Скрипт требует `--max-warnings 0` в `scripts.lint` (package.json) и в каждом
// вызове eslint в `.github/workflows/ci.yml`, иначе exit 1.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const ZERO_WARNINGS = '--max-warnings 0'

export function auditLintGate({ pkgText, ciText }) {
  const findings = []

  let pkg
  try {
    pkg = JSON.parse(pkgText)
  } catch {
    return ['package.json: не разбирается как JSON']
  }

  const lint = pkg.scripts?.lint || ''
  if (!lint.includes(ZERO_WARNINGS)) {
    findings.push(`package.json: scripts.lint = "${lint}" — нужен ${ZERO_WARNINGS}`)
  }

  const eslintLines = ciText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && /\beslint\b/.test(line))

  if (eslintLines.length === 0) {
    findings.push('ci.yml: нет вызова eslint — гейт нечего проверять')
  }
  for (const line of eslintLines) {
    if (!line.includes(ZERO_WARNINGS)) {
      findings.push(`ci.yml: "${line}" — нужен ${ZERO_WARNINGS}`)
    }
  }

  return findings
}

function main() {
  const findings = auditLintGate({
    pkgText: readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    ciText: readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'),
  })

  if (findings.length > 0) {
    for (const finding of findings) console.error(`✗ ${finding}`)
    console.error('\nИтог: FAIL. Линтер обязан падать на любом предупреждении.')
    process.exit(1)
  }

  console.log(`Итог: линтер-гейт строгий (${ZERO_WARNINGS}) ✓`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
