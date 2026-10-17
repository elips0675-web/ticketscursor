import { describe, it, expect, vi } from 'vitest'
import { trackRequest, getMetricsLines, cpuSeconds, eventLoopLagSeconds } from '../metrics.js'

const SEEN = new Set()

function mockReqRes(route, method, statusCode) {
  const req = {
    method: method || 'GET',
    route: route && { path: route },
    baseUrl: route,
    path: route || '/test',
  }
  const res = {
    statusCode,
    on: vi.fn((event, fn) => { if (event === 'finish') fn() }),
  }
  return { req, res }
}

function routeName(base) {
  let n = base
  while (SEEN.has(n)) n = base + Math.random().toString(36).slice(2, 6)
  SEEN.add(n)
  return n
}

describe('trackRequest', () => {
  it('records timing and calls next', () => {
    const r = routeName('/test')
    const { req, res } = mockReqRes(r, 'GET', 200)
    const next = vi.fn()
    trackRequest(req, res, next)
    expect(next).toHaveBeenCalled()
    const lines = getMetricsLines()
    expect(lines.some(l => l.startsWith('http_request_duration_ms_count') && l.includes(r))).toBe(true)
  })

  it('groups status codes by 100-range', () => {
    const r = routeName('/grouped')
    for (const code of [200, 201, 203]) {
      const { req, res } = mockReqRes(r, 'POST', code)
      trackRequest(req, res, vi.fn())
    }
    const lines = getMetricsLines()
    const groupLines = lines.filter(l => l.includes(r))
    expect(groupLines.length).toBeGreaterThan(0)
    expect(groupLines.some(l => l.includes('200'))).toBe(true)
  })

  it('limits stored entries to ~1000 per key', () => {
    const r = routeName('/limit')
    const { req, res } = mockReqRes(r, 'GET', 200)
    for (let i = 0; i < 1100; i++) {
      trackRequest(req, res, vi.fn())
    }
    const lines = getMetricsLines()
    const countLine = lines.find(l => l.startsWith('http_request_duration_ms_count') && l.includes(r))
    const count = parseInt(countLine.split('} ')[1], 10)
    expect(count).toBe(1000)
  })

  it('includes bucket lines', () => {
    const r = routeName('/buckets')
    const { req, res } = mockReqRes(r, 'GET', 200)
    trackRequest(req, res, vi.fn())
    const lines = getMetricsLines()
    const bucketLines = lines.filter(l => l.includes('_bucket') && l.includes(r))
    expect(bucketLines.length).toBeGreaterThan(0)
  })

  it('handles missing route path gracefully', () => {
    const req = { method: 'DELETE', route: null, baseUrl: null, path: '/raw' }
    const res = { statusCode: 404, on: vi.fn((e, fn) => { if (e === 'finish') fn() }) }
    trackRequest(req, res, vi.fn())
    const lines = getMetricsLines()
    expect(lines.some(l => l.includes('/raw'))).toBe(true)
  })
})

describe('http_requests_total', () => {
  it('counts requests by status class with method and route labels', () => {
    const r = routeName('/counter-ok')
    for (let i = 0; i < 3; i++) {
      const { req, res } = mockReqRes(r, 'GET', 200)
      trackRequest(req, res, vi.fn())
    }
    const { req, res } = mockReqRes(r, 'GET', 500)
    trackRequest(req, res, vi.fn())
    const lines = getMetricsLines()
    const ok = lines.find(l => l.startsWith('http_requests_total') && l.includes(`route="${r}"`) && l.includes('status="2xx"'))
    const err = lines.find(l => l.startsWith('http_requests_total') && l.includes(`route="${r}"`) && l.includes('status="5xx"'))
    expect(ok).toBeDefined()
    expect(err).toBeDefined()
    expect(ok.endsWith(' 3')).toBe(true)
    expect(err.endsWith(' 1')).toBe(true)
    expect(lines).toContain('# TYPE http_requests_total counter')
  })
})

describe('cpuSeconds', () => {
  it('returns a finite positive number of CPU seconds', () => {
    let sum = 0
    for (let i = 0; i < 200000; i++) sum += i
    const value = cpuSeconds()
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(0)
    expect(sum).toBeGreaterThan(0)
  })
})

describe('eventLoopLagSeconds', () => {
  it('returns a finite non-negative number', () => {
    const value = eventLoopLagSeconds()
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
  })
})
