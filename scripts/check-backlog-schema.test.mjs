/**
 * Тесты гейта `scripts/check-backlog-schema.mjs` (структурный канон бэклога).
 *
 * Правило: «Что-доделать.txt» держит схему — лимит объёма, ID-колонку без дублей,
 * целостность столбцов, статусный префикс ⏳/✅/—, дату проверки у открытых P1.
 *
 * Тесты идут на temp-фикстурах (репозиторий не трогается) и ДОПОЛНИТЕЛЬНО
 * проверяют обе стороны на настоящем файле: гейт зелёный на своём каноне и
 * красный, если канон нарушить (гейт, красный на собственном коде, бесполезен;
 * зелёный по построению — тем более). Отдельно — CLI-смоук: exit 0/1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { auditBacklog, splitRow, ID_RE, MAX_LINES, MAX_BYTES } from './check-backlog-schema.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REAL = path.join(ROOT, 'Что-доделать.txt')
const GATE = path.join(ROOT, 'scripts', 'check-backlog-schema.mjs')

function table(headerCells, rows) {
  const header = `| ${headerCells.join(' | ')} |`
  const separator = `|${headerCells.map(() => '---').join('|')}|`
  return [header, separator, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

const P1_HEADING = '## 🟡 ВАЖНО (P1) — требуют исправления'
const P1_HEADER = ['ID', 'Проблема', 'Источник', 'Факт', 'Решение', 'Статус']

let tmp

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-schema-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function writeFixture(content, name = 'Что-доделать.txt') {
  const file = path.join(tmp, name)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

describe('реальный «Что-доделать.txt»', () => {
  it('проходит схему (гейт зелёный на каноне)', () => {
    expect(auditBacklog(fs.readFileSync(REAL, 'utf8'))).toEqual([])
  })

  it('краснеет, если в реальный файл подмешать строку с битым ID', () => {
    const text = fs.readFileSync(REAL, 'utf8')
    const broken = text.replace(/^\| P1-08 \|/m, '| 8 |')
    expect(broken).not.toBe(text)
    expect(auditBacklog(broken).some((p) => p.includes('не формата'))).toBe(true)
  })
})

describe('splitRow', () => {
  it('не делит ячейку по экранированному \\|', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b \\| c', 'd'])
  })

  it('обрезает внешние палки и пробелы', () => {
    expect(splitRow('|  x  |  y  |')).toEqual(['x', 'y'])
  })
})

describe('формат ID', () => {
  it('принимает PREFIX-NN всех секций и legacy G1/Z8', () => {
    for (const id of ['P1-08', 'P2-04', 'E2E-01', 'TEST-17', 'INV-15', 'AUD-06', 'CON-03', 'MET-01', 'PRC-13', 'NEW-08', 'INF-05', 'PRD-19', 'RLS-03', 'ECH-11', 'G1', 'Z8']) {
      expect(ID_RE.test(id), id).toBe(true)
    }
  })

  it('отвергает номер без префикса, короткий паддинг, строчные и трёхзначный', () => {
    for (const id of ['3', 'P1-8', 'p1-08', 'PRC-100', '', 'P1-08 ']) {
      expect(ID_RE.test(id), id).toBe(false)
    }
  })
})

describe('лимит объёма', () => {
  it(`строк больше ${MAX_LINES} → проблема`, () => {
    const text = Array.from({ length: MAX_LINES + 1 }, () => 'x').join('\n')
    expect(auditBacklog(text).some((p) => p.includes('объём'))).toBe(true)
  })

  it(`байт больше ${MAX_BYTES} → проблема`, () => {
    const text = 'Ы'.repeat(MAX_BYTES / 2 + 1)
    expect(auditBacklog(text).some((p) => p.includes('объём'))).toBe(true)
  })
})

describe('уникальность ID', () => {
  it('дубль ID в двух таблицах → проблема', () => {
    const first = table(['ID', 'Задача', 'Статус'], [['P1-01', 'a', '⏳']])
    const second = table(['ID', 'Задача', 'Статус'], [['P1-01', 'b', '⏳']])
    const problems = auditBacklog(`${first}\n\n${second}`)
    expect(problems.some((p) => p.includes('уже встречался'))).toBe(true)
  })

  it('одинаковый номер в разных секциях — не дубль', () => {
    const first = table(['ID', 'Задача', 'Статус'], [['P1-01', 'a', '⏳']])
    const second = table(['ID', 'Задача', 'Статус'], [['P2-01', 'b', '⏳']])
    expect(auditBacklog(`${first}\n\n${second}`)).toEqual([])
  })

  it('номер без префикса в колонке ID → проблема', () => {
    const problems = auditBacklog(table(['ID', 'Задача', 'Статус'], [['3', 'a', '⏳']]))
    expect(problems.some((p) => p.includes('не формата'))).toBe(true)
  })
})

describe('целостность столбцов', () => {
  it('лишняя ячейка → проблема с числом ячеек', () => {
    const problems = auditBacklog(table(['ID', 'Задача', 'Статус'], [['P1-01', 'a', '⏳', 'лишнее']]))
    expect(problems.some((p) => p.includes('ячеек 4 при шапке 3'))).toBe(true)
  })

  it('недостающая ячейка → проблема с числом ячеек', () => {
    const problems = auditBacklog(table(['ID', 'Задача', 'Статус'], [['P1-01', 'a']]))
    expect(problems.some((p) => p.includes('ячеек 2 при шапке 3'))).toBe(true)
  })

  it('таблица без колонки ID не требует ID (секции ПЛАН-типа)', () => {
    const problems = auditBacklog(table(['Этап', 'Задача', 'Статус'], [['66', 'x', '⏳ не начат']]))
    expect(problems).toEqual([])
  })
})

describe('статусный префикс', () => {
  it('проза вместо статуса → проблема', () => {
    const problems = auditBacklog(table(['ID', 'Задача', 'Статус'], [['P1-01', 'a', 'нужен рефакторинг']]))
    expect(problems.some((p) => p.includes('не начинается с ⏳/✅/—'))).toBe(true)
  })

  it('«—» как статус проходит', () => {
    expect(auditBacklog(table(['ID', 'Задача', 'Статус'], [['PRC-04', 'a', '—']]))).toEqual([])
  })
})

describe('даты у открытых P1', () => {
  function p1(status) {
    return `${P1_HEADING}\n\n${table(P1_HEADER, [['P1-01', 'x', 'y', 'z', 'w', status]])}`
  }

  it('открытая P1 без даты проверки → проблема', () => {
    expect(auditBacklog(p1('⏳')).some((p) => p.includes('без «(проверено'))).toBe(true)
  })

  it('закрытая P1 без даты закрытия → проблема', () => {
    expect(auditBacklog(p1('✅ закрыто как-то')).some((p) => p.includes('без даты «✅ ДД.ММ.ГГГГ»'))).toBe(true)
  })

  it('открытая с датой проверки и закрытая с датой — обе проходят', () => {
    expect(auditBacklog(p1('⏳ (проверено 17.10.2026)'))).toEqual([])
    expect(auditBacklog(p1('✅ 09.10.2026'))).toEqual([])
  })

  it('без секции «ВАЖНО (P1)» даты не требуются', () => {
    expect(auditBacklog(table(P1_HEADER, [['P1-01', 'x', 'y', 'z', 'w', '⏳']]))).toEqual([])
  })
})

describe('CLI', () => {
  it('реальный файл → exit 0 и «схема соблюдена»', () => {
    const out = execFileSync(process.execPath, [GATE], { encoding: 'utf8' })
    expect(out).toContain('схема соблюдена')
  })

  it('файл с нарушением → exit 1 и нарушение в stderr', () => {
    const file = writeFixture(table(['ID', 'Задача', 'Статус'], [['3', 'x', '⏳']]))
    let error
    try {
      execFileSync(process.execPath, [GATE, file], { encoding: 'utf8', stdio: 'pipe' })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeTruthy()
    expect(error.status).toBe(1)
    expect(String(error.stderr)).toContain('не формата')
  })
})
