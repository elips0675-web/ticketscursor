/* global __ENV */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const baseUrl = __ENV.API_URL || 'http://localhost:4000'
const token = __ENV.TOKEN

const wikiTrend = new Trend('wiki_duration')
const wikiErrors = new Rate('wiki_errors')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    wiki_errors: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

const headers = {
  headers: { Authorization: `Bearer ${token}` },
}

export default function () {
  const listRes = http.get(`${baseUrl}/api/wiki?page=1&limit=20`, headers)
  wikiTrend.add(listRes.timings.duration)
  wikiErrors.add(listRes.status !== 200)

  check(listRes, {
    'wiki list status 200': (r) => r.status === 200,
    'wiki has data': (r) => Array.isArray(r.json('data')),
  })

  const searchRes = http.get(`${baseUrl}/api/wiki?search=тест`, headers)
  wikiErrors.add(searchRes.status !== 200)

  check(searchRes, {
    'wiki search status 200': (r) => r.status === 200,
  })

  sleep(1)
}
