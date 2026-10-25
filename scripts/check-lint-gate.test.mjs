import { describe, it, expect } from 'vitest'
import { auditLintGate, ZERO_WARNINGS } from './check-lint-gate.mjs'

const pkg = (lint) => JSON.stringify({ scripts: { lint } })
const ci = (...lines) => ['name: ci', 'jobs:', '  test:', '    steps:', ...lines.map((l) => `      - run: ${l}`)].join('\n')

describe('check-lint-gate: строгость линтер-гейта', () => {
  it('пропускает строгий гейт: lint и CI требуют --max-warnings 0', () => {
    expect(auditLintGate({ pkgText: pkg('eslint . --max-warnings 0'), ciText: ci('npx eslint . --max-warnings 0') })).toEqual([])
  })

  it('ловит package.json без --max-warnings 0', () => {
    const findings = auditLintGate({ pkgText: pkg('eslint .'), ciText: ci('npx eslint . --max-warnings 0') })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('package.json')
    expect(findings[0]).toContain(ZERO_WARNINGS)
  })

  it('ловит CI с ослабленным порогом 100', () => {
    const findings = auditLintGate({ pkgText: pkg('eslint . --max-warnings 0'), ciText: ci('npx eslint . --max-warnings 100') })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('ci.yml')
    expect(findings[0]).toContain('--max-warnings 100')
  })

  it('ловит CI без флага вовсе', () => {
    const findings = auditLintGate({ pkgText: pkg('eslint . --max-warnings 0'), ciText: ci('npx eslint .') })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('ci.yml')
  })

  it('ловит CI, где eslint не вызывается', () => {
    const findings = auditLintGate({ pkgText: pkg('eslint . --max-warnings 0'), ciText: ci('npx tsc --noEmit') })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('нет вызова eslint')
  })

  it('проверяет каждый вызов eslint, а не только первый', () => {
    const findings = auditLintGate({
      pkgText: pkg('eslint . --max-warnings 0'),
      ciText: ci('npx eslint . --max-warnings 0', 'npx eslint server --max-warnings 50'),
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('--max-warnings 50')
  })

  it('сообщает о битом package.json, а не падает', () => {
    expect(auditLintGate({ pkgText: '{', ciText: ci('npx eslint . --max-warnings 0') })).toEqual([
      'package.json: не разбирается как JSON',
    ])
  })
})
