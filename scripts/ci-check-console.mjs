// P1 №11 (Что-доделать.txt): раннер check-console для CI.
// Playwright в CI сам поднимает webServer'ы (server:4000, vite:5173) и гасит их
// после прогона, а check-console.mjs — отдельный скрипт, которому нужны живые
// серверы и auth.json (создаётся playwright global-setup'ом). Этот раннер:
//   1. проверяет, что порты 4000/5173 свободны (занятый порт = чужой процесс,
//      обход по нему даёт ложный результат — ловится EADDRINUSE/VITE-смена порта);
//   2. поднимает server (cwd=server, src/index.js → 4000) и vite (cwd=root, 5173);
//   3. ждёт /api/health и 5173;
//   4. обновляет auth.json через dev-login (JWT живёт ~15 мин: протухший токен
//      даёт 401 на всех публичных страницах — дефект 21.10.2026);
//   5. запускает node check-console.mjs;
//   6. гасит детей и выходит с кодом check-console.
import { spawn, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_DIR = path.join(ROOT, 'server')
const API_URL = process.env.API_URL || 'http://localhost:4000'
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
const IS_WIN = process.platform === 'win32'

async function waitForHttp(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`Server not ready after ${timeoutMs}ms: ${url}`)
}

function killTree(child) {
  if (child.pid == null) return
  try {
    if (IS_WIN) {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    // already exited — fine
  }
}

// Занятый порт = чужой процесс (обычно сирота прошлого прогона): наш сервер
// умирает с EADDRINUSE, vite уходит на другой порт, а обход идёт по чужим
// инстансам с непонятным состоянием — ложный результат. Проверяем до старта.
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.connect({ port, host: '127.0.0.1' })
    probe.once('connect', () => {
      probe.destroy()
      resolve(false)
    })
    probe.once('error', () => resolve(true))
  })
}

async function ensurePortsFree(ports) {
  for (const port of ports) {
    if (!(await isPortFree(port))) {
      throw new Error(
        `порт ${port} занят чужим процессом — обход по нему дал бы ложный результат. ` +
          `Найти: netstat -ano | findstr :${port}, убить: taskkill /PID <pid> /T /F`,
      )
    }
  }
}

// JWT от dev-login живёт ~15 минут: протухший токен в auth.json даёт 401 на
// всех публичных страницах (дефект 21.10.2026 — check-console FAILED на 14
// страницах при исправном коде). Обновляем токен перед каждым обходом.
async function refreshAuthJson() {
  const res = await fetch(`${API_URL}/api/auth/dev-login`, { method: 'POST' })
  const body = await res.json()
  const token = body?.data?.token || body?.token
  if (!res.ok || !token) throw new Error(`dev-login не дал токен: HTTP ${res.status}`)
  writeFileSync(
    path.join(ROOT, 'auth.json'),
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5173',
          localStorage: [
            { name: 'token', value: token },
            {
              name: 'user',
              value: JSON.stringify({
                id: 1,
                name: 'Алексей Петров',
                email: 'alexey@example.com',
                role: 'super_admin',
              }),
            },
          ],
        },
      ],
    }),
  )
  console.log('[runner] auth.json обновлён через dev-login')
}

async function main() {
  await ensurePortsFree([4000, 5173])
  const api = spawn('node', ['src/index.js'], { cwd: SERVER_DIR, stdio: 'inherit' })
  // На Windows npx — это npx.cmd: без shell:true спавн падает с EINVAL.
  const vite = spawn(IS_WIN ? 'npx.cmd' : 'npx', ['vite', '--port', '5173'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: IS_WIN,
  })

  try {
    await waitForHttp(`${API_URL}/api/health`)
    await waitForHttp(BASE_URL)
    await refreshAuthJson()

    const code = await new Promise((resolve, reject) => {
      const check = spawn('node', ['check-console.mjs'], { cwd: ROOT, stdio: 'inherit' })
      check.on('exit', (c) => resolve(c)) // exit code <0 if killed — treat as failure
      check.on('error', reject)
    })

    process.exitCode = typeof code === 'number' && code >= 0 ? code : 1
  } finally {
    killTree(api)
    killTree(vite)
  }
}

main().catch((err) => {
  console.error(`ci-check-console: ${err.message}`)
  process.exit(1)
})