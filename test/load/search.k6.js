/* global __ENV */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const baseUrl = __ENV.API_URL || 'http://localhost:4000'
const token = __ENV.TOKEN

const searchTrend = new Trend('search_duration')
const searchErrors = new Rate('search_errors')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    search_errors: ['rate<0.02'],
    http_req_duration: ['p(95)<1000'],
  },
}

const headers = {
  headers: { Authorization: `Bearer ${token}` },
}

const queries = ['тикет', 'тест', 'ошибка', 'запрос', 'помощь']

export default function () {
  const q = queries[Math.floor(Math.random() * queries.length)]
  const res = http.get(`${baseUrl}/api/search?q=${encodeURIComponent(q)}`, headers)
  searchTrend.add(res.timings.duration)
  searchErrors.add(res.status !== 200)

  check(res, {
    'search status 200': (r) => r.status === 200,
    'search has results': (r) => typeof r.json('data') === 'object',
  })

  sleep(0.5)
}
