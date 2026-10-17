import { monitorEventLoopDelay } from 'node:perf_hooks'

const requestTimings = new Map()
const requestCounts = new Map()
const BUCKETS = [50, 100, 200, 500, 1000, 2000, 5000]

const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 })
eventLoopHistogram.enable()

export function eventLoopLagSeconds() {
  const mean = eventLoopHistogram.mean
  return Number.isFinite(mean) ? mean / 1e9 : 0
}

export function cpuSeconds() {
  const usage = process.cpuUsage()
  return (usage.user + usage.system) / 1e6
}

export function trackRequest(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {
    const route = req.route?.path || req.baseUrl || req.path || 'unknown'
    const method = req.method
    const statusClass = Math.floor(res.statusCode / 100)
    const status = statusClass * 100
    const key = `${method} ${route} ${status}`
    const countKey = `${method} ${route} ${statusClass}xx`
    const elapsed = Date.now() - start
    if (!requestTimings.has(key)) requestTimings.set(key, [])
    const timings = requestTimings.get(key)
    timings.push(elapsed)
    if (timings.length > 1000) timings.shift()
    const counted = requestCounts.get(countKey)
    if (counted) counted.count += 1
    else requestCounts.set(countKey, { method, route, status: `${statusClass}xx`, count: 1 })
  })
  next()
}

export function getMetricsLines() {
  const lines = []
  lines.push(`# HELP http_request_duration_ms Request duration in milliseconds`)
  lines.push(`# TYPE http_request_duration_ms histogram`)
  for (const [key, timings] of requestTimings) {
    const total = timings.reduce((a, b) => a + b, 0)
    const count = timings.length
    const avg = count > 0 ? (total / count).toFixed(1) : '0'
    lines.push(`http_request_duration_ms_count{route="${key}"} ${count}`)
    lines.push(`http_request_duration_ms_sum{route="${key}"} ${total}`)
    lines.push(`http_request_duration_ms_avg{route="${key}"} ${avg}`)
    for (const bucket of BUCKETS) {
      const le = timings.filter(t => t <= bucket).length
      lines.push(`http_request_duration_ms_bucket{route="${key}",le="${bucket}"} ${le}`)
    }
    lines.push(`http_request_duration_ms_bucket{route="${key}",le="+Inf"} ${count}`)
  }
  lines.push(`# HELP http_requests_total Total HTTP requests by status class`)
  lines.push(`# TYPE http_requests_total counter`)
  for (const { method, route, status, count } of requestCounts.values()) {
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`)
  }
  return lines
}
