/**
 * Тесты гейта `scripts/check-doc-counters.mjs` (процесс №5 «Что-доделать.txt»).
 *
 * Правило: числа тестов в шапках документов = факт из `test-analysis/test-inventory.json`,
 * а не «ручные цифры». Гейт обязан:
 *   — пропускать текст, где числа совпали с инвентарём;
 *   — ловить устаревшее число с `file:line` (было/стало);
 *   — ловить исчезнувшую фразу-шаблон (структуру строки переписали);
 *   — ловить неоднозначность (фраза встречается дважды);
 *   — `--fix` менять ТОЛЬКО числовые группы, не трогая дату и текст вокруг.
 *
 * Отдельно: гейт зелёный на настоящих документах репозитория (гейт, красный на
 * своём же коде, бесполезен; зелёный по построению — тем более) и красный, если
 * подменить реальное число.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadCounts, specs, groupByFile, auditText, fixText } from './check-doc-counters.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const C = {
  clientFiles: 90,
  clientTests: 800,
  serverFiles: 89,
  serverTests: 1144,
  totalFiles: 179,
  totalTests: 1944,
  e2eFiles: 19,
  e2eTests: 61,
}

const specsFor = (file, c = C) => specs(c).filter((s) => s.file === file)

const README = [
  '| Покрытие тестами | 47 client / 93 server / 13 E2E | 800 client / 1144 server / 61 E2E (1944, 0 failures) |',
  '| Клиентские тесты | 800 тестов, 90 файлов |',
  '| Серверные тесты | 1144 теста, 89 файлов |',
  "| E2E тесты (Playwright) | 19 spec'ов, 61 тест; check-console 17 страниц |",
].join('\n')

const BACKLOG = [
  '> Тесты (факт 11.10.2026): клиент 90 файлов / 800 + сервер 89 файлов / 1144 = **1944 тестов, 0 failures**; E2E 19 spec / 61 + check-console 17/17; инвентарь — 179 файлов / 1944 тестов).',
  '',
  'Факт на 11.10: **1944 тестов, 0 failures** (клиент 90/800; сервер 89/1144; ...).',
].join('\n')

describe('doc-counters: совпадение с инвентарём', () => {
  it('корректный текст — находок нет', () => {
    expect(auditText(README, specsFor('README.md'), C)).toEqual([])
    expect(auditText(BACKLOG, specsFor('Что-доделать.txt'), C)).toEqual([])
  })

  it('устаревшее число — находка stale с file:line и было/стало', () => {
    const stale = README.replace('800 тестов', '791 тестов')
    const findings = auditText(stale, specsFor('README.md'), C)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      file: 'README.md',
      id: 'client-row',
      kind: 'stale',
      line: 2,
      found: '791',
      expected: '800',
    })
  })

  it('исчезнувшая фраза-шаблон — находка missing', () => {
    const withoutRiskRow = README.split('\n').slice(1).join('\n')
    const findings = auditText(withoutRiskRow, specsFor('README.md'), C)
    expect(findings.some((f) => f.kind === 'missing' && f.id === 'risk-table')).toBe(true)
  })

  it('фраза встречается дважды — находка ambiguous', () => {
    const doubled = `${README}\n| Клиентские тесты | 800 тестов, 90 файлов |`
    const findings = auditText(doubled, specsFor('README.md'), C)
    expect(findings.some((f) => f.kind === 'ambiguous' && f.id === 'client-row')).toBe(true)
  })

  it('дата в шаблоне не зашита: другая дата — всё равно совпадение', () => {
    const otherDate = BACKLOG.replace('факт 11.10.2026', 'факт 01.01.2027')
    expect(auditText(otherDate, specsFor('Что-доделать.txt'), C)).toEqual([])
  })
})

describe('doc-counters: --fix точечный', () => {
  it('меняет только число, сохраняя текст и дату', () => {
    const stale = README.replace('800 client', '791 client')
    const { text, changed } = fixText(stale, specsFor('README.md'), C)
    expect(changed).toBe(1)
    expect(text).toBe(README)
  })

  it('уже корректный текст не меняется', () => {
    const { text, changed } = fixText(README, specsFor('README.md'), C)
    expect(changed).toBe(0)
    expect(text).toBe(README)
  })

  it('чинит несколько мишеней сразу (бэклог: шапка + итог)', () => {
    const stale = BACKLOG.replace(/800/g, '700').replace(/900/g, '700')
    const { text, changed } = fixText(stale, specsFor('Что-доделать.txt'), C)
    expect(changed).toBeGreaterThanOrEqual(2)
    expect(auditText(text, specsFor('Что-доделать.txt'), C)).toEqual([])
  })
})

describe('doc-counters: настоящие документы репозитория', () => {
  const real = loadCounts(ROOT)

  it('инвентарь читается и даёт положительные числа', () => {
    expect(real.clientTests).toBeGreaterThan(0)
    expect(real.serverTests).toBeGreaterThan(0)
    expect(real.totalTests).toBe(real.clientTests + real.serverTests)
  })

  it('все мишени зелёные на живых файлах', () => {
    for (const [file, fileSpecs] of groupByFile(specs(real))) {
      const text = readFileSync(path.join(ROOT, file), 'utf8')
      expect(auditText(text, fileSpecs, real), `файл ${file}`).toEqual([])
    }
  })

  it('подмена реального числа делает гейт красным (не зелёный по построению)', () => {
    const text = readFileSync(path.join(ROOT, 'Что-доделать.txt'), 'utf8')
    const broken = text.replace(/клиент \d+ файлов \/ \d+/, 'клиент 1 файлов / 1')
    const findings = auditText(broken, specsFor('Что-доделать.txt', real), real)
    expect(findings.some((f) => f.kind === 'stale')).toBe(true)
  })
})
