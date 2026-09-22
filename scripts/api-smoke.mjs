// Live API smoke test: dev-login → ключевые эндпоинты приложения.
// Без внешних зависимостей (Node 18+ fetch). Проверяет, что приложение реально работает.
//   node scripts/api-smoke.mjs
//   API_BASE=http://localhost:4000 node scripts/api-smoke.mjs
const BASE = process.env.API_BASE || 'http://localhost:4000'

async function request(path, { method = 'GET', token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, ok: res.status >= 200 && res.status < 300, body: await res.json().catch(() => ({})) }
}

const results = []
async function check(name, fn, { allowForbidden = false } = {}) {
  try {
    const r = await fn()
    const pass = r.ok || (allowForbidden && r.status === 403)
    results.push({ name, status: r.status, pass })
    console.log(`${pass ? '✅' : '❌'} ${name}: ${r.status}`)
  } catch (e) {
    results.push({ name, status: 'ERR', pass: false })
    console.log(`❌ ${name}: ${e}`)
  }
}

const login = await request('/api/auth/dev-login', { method: 'POST' })
const token = login.body?.data?.token || login.body?.token
if (!token) {
  console.log(`❌ dev-login не вернул token (${login.status}):`, JSON.stringify(login.body))
  process.exit(1)
}
console.log(`🔑 dev-login OK (${login.status}), token получен`)

await check('GET /api/health', () => request('/api/health'))
await check('GET /api/health/ready', () => request('/api/health/ready'))
await check('GET /api/tickets', () => request('/api/tickets', { token }))
await check('GET /api/employees', () => request('/api/employees', { token }))
await check('GET /api/tickets/sla/stats', () => request('/api/tickets/sla/stats', { token }))
await check('GET /api/employees/stats', () => request('/api/employees/stats', { token }))
await check('GET /api/news', () => request('/api/news', { token }))
await check('GET /api/wiki', () => request('/api/wiki', { token }))
await check('GET /api/polls', () => request('/api/polls', { token }))
await check('GET /api/calendar', () => request('/api/calendar', { token }))
await check('GET /api/chats', () => request('/api/chats', { token }))
await check('GET /api/notifications', () => request('/api/notifications', { token }))
await check('GET /api/files/folders', () => request('/api/files/folders', { token }))
await check('GET /api/search?q=тикет', () => request('/api/search?q=%D1%82%D0%B8%D0%BA%D0%B5%D1%82', { token }))
await check('GET /api/admin/users', () => request('/api/admin/users', { token }), { allowForbidden: true })
await check('GET /api/rules', () => request('/api/rules', { token }), { allowForbidden: true })
await check('GET /api/admin/features', () => request('/api/admin/features', { token }), { allowForbidden: true })

const failed = results.filter((r) => !r.pass)
console.log(`\nИтого: ${results.length - failed.length}/${results.length} ок`)
if (failed.length) {
  for (const f of failed) console.log('FAIL:', f.name, f.status)
  process.exit(1)
}