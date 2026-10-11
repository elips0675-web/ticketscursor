/**
 * Тесты гейта `scripts/check-backlog-closed-body.mjs` (канон формы закрытых записей).
 *
 * Правило: закрытая запись в бэклоге = ОДНА компактная строка ✅ + ссылка на
 * «Что сделано.txt». Секция с ЗАКРЫТО/✅ и ЛЮБЫМ телом под ней = FAIL («надгробие»).
 * Ровно две формы: (A) строка markdown-таблицы с ✅/ЗАКРЫТО в незакрытой секции,
 * (B) закрытый заголовок, под которым только пустые строки и `---`.
 *
 * Проверки идут на temp-фикстурах (тест не трогает репозиторий) + отдельно:
 * гейт зелёный на настоящем «Что-доделать.txt» (гейт, красный на своём же коде,
 * бесполезен; зелёный по построению — тем более), и обратное — если под закрытый
 * заголовок добавить тело, гейт обязан покраснеть.
 *
 * Дополнительно тестируется инструмент `scripts/stage-section.mjs`: он обязан
 * ОТКАЗЫВАТЬСЯ писать «надгробие» (close + --body) и всегда прогонять результат
 * через тот же гейт.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { auditLines, auditFile } from './check-backlog-closed-body.mjs'
import { buildClosedLine, buildOpenSection, stage } from './stage-section.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKLOG = path.join(ROOT, 'Что-доделать.txt')

let tmp

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-body-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function writeFixture(name, text) {
  const file = path.join(tmp, name)
  fs.writeFileSync(file, text, 'utf8')
  return file
}

/* ------------------------------------------------------------------ */

describe('гейт backlog-closed-body: ловит «надгробие»', () => {
  it('закрытый заголовок с телом-текстом — FAIL с file:line', () => {
    const text = [
      '# Бэклог',
      '',
      '---',
      '',
      '## ✅ P0: ПЕРИМЕТР — ЗАКРЫТО 09.10.2026',
      '',
      'Сделано (детали — «Что сделано.txt»): полный набор заголовков.',
      '',
      '## 🟡 ВАЖНО (P1)',
      '',
      '| # | Проблема | Статус |',
      '| 9 | секреты | ✅ 09.10.2026 |',
    ].join('\n')
    const { problems } = auditLines(text.split(/\r?\n/))
    expect(problems).toHaveLength(1)
    expect(problems[0].line).toBe(7)
    expect(problems[0].heading).toContain('ЗАКРЫТО')
  })

  it('закрытый заголовок с блок-цитатой под ним — FAIL', () => {
    const text = [
      '## ✅ Этап 66 — ЗАКРЫТО 10.10.2026',
      '',
      '> Закрытые детали — в CHANGELOG.',
    ].join('\n')
    const { problems } = auditLines(text.split(/\r?\n/))
    expect(problems).toHaveLength(1)
    expect(problems[0].line).toBe(3)
  })

  it('закрытый заголовок с таблицей под ним — FAIL (тело — таблица)', () => {
    const text = [
      '## ✅ P1 — ЗАКРЫТО 10.10.2026',
      '',
      '| # | Статус |',
      '| 9 | ✅ 09.10.2026 |',
    ].join('\n')
    expect(auditLines(text.split(/\r?\n/)).problems.length).toBeGreaterThan(0)
  })

  it('несколько тел под одним заголовком — все находки, а не одна', () => {
    const text = [
      '## ✅ X — ЗАКРЫТО 01.10',
      'aaa',
      'bbb',
    ].join('\n')
    const { problems } = auditLines(text.split(/\r?\n/))
    expect(problems).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ */

describe('гейт backlog-closed-body: пропускает легальные формы', () => {
  it('форма B: закрытый заголовок, под которым только пустые строки и ---', () => {
    const text = [
      '# Бэклог',
      '',
      '---',
      '',
      '## ✅ P0: ПЕРИМЕТР — ЗАКРЫТО 09.10.2026 — см. «Что сделано.txt»',
      '',
      '---',
      '',
      '## 🟡 ВАЖНО (P1)',
    ].join('\n')
    expect(auditLines(text.split(/\r?\n/)).problems).toEqual([])
  })

  it('форма B: закрытая запись последняя в файле (без следующего заголовка) — OK', () => {
    const text = [
      '## ✅ X — ЗАКРЫТО 01.10',
      '',
      '---',
    ].join('\n')
    expect(auditLines(text.split(/\r?\n/)).problems).toEqual([])
  })

  it('форма A: строки таблицы с ✅ внутри ОТКРЫТОЙ секции — OK', () => {
    const text = [
      '# Бэклог',
      '',
      '## 🟡 ВАЖНО (P1)',
      '',
      '| # | Проблема | Статус |',
      '|---|----------|--------|',
      '| 9 | секреты | ✅ 09.10.2026 |',
      '| 11 | E2E не в CI | ✅ 10.10.2026 |',
      '| 13 | coverage | ⏳ |',
    ].join('\n')
    expect(auditLines(text.split(/\r?\n/)).problems).toEqual([])
  })

  it('открытые секции без ✅/ЗАКРЫТО с любым телом — OK', () => {
    const text = [
      '## Открытые пункты из прежних аудитов',
      '',
      '- что-то в теле',
      '- ещё строка',
      '',
      '### Подсекция',
      '',
      '| # | Статус |',
      '| 1 | ✅ 01.01 |',
    ].join('\n')
    expect(auditLines(text.split(/\r?\n/)).problems).toEqual([])
  })

  it('заголовок верхнего уровня (#) с ✅ в шапке — не секция, не трогается', () => {
    const text = [
      '# Что доделать — актуальный статус (10.10.2026)',
      '',
      '> Даты: ✅ P0 закрыт 09.10, ✅ подфича 4 закрыта 09.10.',
    ].join('\n')
    expect(auditLines(text.split(/\r?\n/)).problems).toEqual([])
  })
})

/* ------------------------------------------------------------------ */

describe('гейт на настоящем репозитории', () => {
  it('зелёный на текущем «Что-доделать.txt» (гейт, красный на своём же коде, бесполезен)', () => {
    const { problems } = auditFile(BACKLOG)
    expect(problems).toEqual([])
  })

  it('факты непустые: гейт действительно что-то проверил', () => {
    const { facts } = auditFile(BACKLOG)
    expect(facts.closedHeadings).toBeGreaterThan(0)
  })

  it('красный, если в копию бэклога вернуть «надгробие» под закрытый заголовок', () => {
    const file = path.join(tmp, 'Что-доделать.txt')
    const doomed = [
      '## ✅ P0: ПЕРИМЕТР — ЗАКРЫТО 09.10.2026',
      '',
      'Сделано — но это тело, которого быть не должно.',
    ].join('\n')
    fs.writeFileSync(file, doomed, 'utf8')
    expect(auditFile(file).problems.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */

describe('инструмент stage-section.mjs', () => {
  it('buildClosedLine — всегда одна компактная строка с ✅, ЗАКРЫТО и ссылкой', () => {
    const line = buildClosedLine({ title: 'P1 №13: routes/admin.js', date: '11.10.2026', ref: 'раздел «P1 №13»' })
    expect(line).toBe('## ✅ P1 №13: routes/admin.js — ЗАКРЫТО 11.10.2026 — см. «Что сделано.txt»: раздел «P1 №13»')
    expect(line.split('\n')).toHaveLength(1)
  })

  it('close с телом — ОТКАЗ (надгробие), файл не трогается', () => {
    const file = writeFixture('Что-доделать.txt', '# Бэклог\n\n---\n')
    const before = fs.readFileSync(file, 'utf8')
    expect(() =>
      stage([{ mode: 'close', title: 'P1', date: '11.10.2026', body: 'тело недопустимо' }], file),
    ).toThrow(/не может иметь тело/)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('close без тела — пишет компактную строку в зону после первого ---', () => {
    const file = writeFixture('Что-доделать.txt', '# Бэклог\n\n---\n\n## 🟡 ВАЖНО (P1)\n')
    const out = stage([{ mode: 'close', title: 'P1 №13: routes/admin.js', date: '11.10.2026', ref: 'раздел «P1 №13»' }], file)
    expect(out).toContain('## ✅ P1 №13: routes/admin.js — ЗАКРЫТО 11.10.2026 — см. «Что сделано.txt»: раздел «P1 №13»')
    // результат проходит тот же гейт
    expect(auditLines(out.split(/\r?\n/), file).problems).toEqual([])
  })

  it('open с телом — пишет открытую секцию, гейт зелёный', () => {
    const file = writeFixture('Что-доделать.txt', '# Бэклог\n\n---\n')
    const out = stage([{ mode: 'open', title: 'Новая тема', body: 'строка 1\nстрока 2' }], file)
    expect(out).toContain('## Новая тема')
    expect(out).toContain('строка 1')
    expect(auditLines(out.split(/\r?\n/), file).problems).toEqual([])
  })

  it('заголовок с ✅ + тело — ОТКАЗ даже в режиме open', () => {
    const file = writeFixture('Что-доделать.txt', '# Бэклог\n\n---\n')
    expect(() => stage([{ mode: 'open', title: '✅ Что-то — ЗАКРЫТО 01.01', body: 'тело' }], file)).toThrow()
  })

  it('Побочный эффект stage(): даже валидные записи проверяются итоговым гейтом на всем файле', () => {
    // Если бы в файле уже было «надгробие», stage не должен молча добавить свою запись.
    const file = writeFixture(
      'Что-доделать.txt',
      '# Бэклог\n\n---\n\n## ✅ X — ЗАКРЫТО 01.01\n\nтело-нарушение\n',
    )
    expect(() => stage([{ mode: 'close', title: 'Новый пункт', date: '11.10.2026' }], file)).toThrow(/нарушает канон/)
  })
})