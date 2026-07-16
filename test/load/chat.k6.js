import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const baseUrl = __ENV.API_URL || 'http://localhost:4000'
const token = __ENV.TOKEN

const msgDuration = new Trend('chat_msg_duration')
const msgErrors = new Rate('chat_msg_errors')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    chat_msg_errors: ['rate<0.05'],
    http_req_duration: ['p(95)<500'],
  },
}

const chatId = __ENV.CHAT_ID || 1

export default function () {
  const payload = JSON.stringify({ text: `Load test message ${Date.now()}` })
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `${__VU}-${Date.now()}`,
    },
  }

  const res = http.post(`${baseUrl}/api/chats/${chatId}/messages`, payload, params)
  msgDuration.add(res.timings.duration)
  msgErrors.add(res.status !== 201)

  check(res, {
    'status is 201': (r) => r.status === 201,
    'has success': (r) => r.json('success') === true,
  })

  sleep(0.5)
}
