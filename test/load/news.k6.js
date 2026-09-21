/* global __ENV */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const baseUrl = __ENV.API_URL || 'http://localhost:4000'
const token = __ENV.TOKEN

const newsTrend = new Trend('news_duration')
const newsErrors = new Rate('news_errors')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    news_errors: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

const headers = {
  headers: { Authorization: `Bearer ${token}` },
}

export default function () {
  const listRes = http.get(`${baseUrl}/api/news?page=1&limit=20`, headers)
  newsTrend.add(listRes.timings.duration)
  newsErrors.add(listRes.status !== 200)

  check(listRes, {
    'news list status 200': (r) => r.status === 200,
    'news has data': (r) => Array.isArray(r.json('data')),
  })

  sleep(1)
}
