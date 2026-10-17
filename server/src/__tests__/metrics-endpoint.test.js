/**
 * Метрики, на которые ссылаются алерты, обязаны реально отдаваться эндпоинтом.
 *
 * Гейт `scripts/check-alerts.mjs` сверяет expr с объявлениями `# HELP`/`# TYPE`
 * в исходниках. Этот тест закрывает вторую половину: берёт те же выражения из
 * `monitoring/alerts.yml` и требует, чтобы эндпоинт `GET /api/metrics` их
 * действительно отдавал. Иначе получится «зелёный по построению»: правило и
 * объявление сослались друг на друга, а наружу метрика не выходит, и алерт
 * не сработает никогда.
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { app } from '../app.js'
import { parseRuleFile, metricsInExpr, PROMETHEUS_BUILTIN_METRICS } from '../../../scripts/check-alerts.mjs'

const RULES_FILE = fileURLToPath(new URL('../../../monitoring/alerts.yml', import.meta.url))

describe('GET /api/metrics: метрики из monitoring/alerts.yml отдаются наружу', () => {
  it('каждое имя из expr (кроме встроенных) присутствует в ответе эндпоинта', async () => {
    const { groups, errors } = parseRuleFile(readFileSync(RULES_FILE, 'utf8'))
    expect(errors).toEqual([])

    const referenced = new Set()
    for (const group of groups) {
      for (const rule of group.rules) {
        for (const name of metricsInExpr(rule.expr)) {
          if (!PROMETHEUS_BUILTIN_METRICS.includes(name)) referenced.add(name)
        }
      }
    }
    expect(referenced.size).toBeGreaterThan(0)

    await request(app).get('/api/health')
    const res = await request(app).get('/api/metrics')

    expect(res.status).toBe(200)
    for (const name of referenced) {
      const family = name.replace(/_(bucket|sum|count)$/, '')
      expect(res.text, `семейство ${family} (из expr «${name}») не найдено в /api/metrics`).toContain(family)
    }
  })

  it('гистограмма отдаёт bucket-серии после первого запроса', async () => {
    await request(app).get('/api/health')
    const res = await request(app).get('/api/metrics')
    expect(res.text).toContain('http_request_duration_ms_bucket{')
    expect(res.text).toContain('http_requests_total{')
  })
})
