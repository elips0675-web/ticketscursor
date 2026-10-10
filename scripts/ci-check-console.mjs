// P1 №11 (Что-доделать.txt): раннер check-console для CI.
// Playwright в CI сам поднимает webServer'ы (server:4000, vite:5173) и гасит их
// после прогона, а check-console.mjs — отдельный скрипт, которому нужны живые
// серверы и auth.json (создаётся playwright global-setup'ом). Этот раннер:
//   1. поднимает server (cwd=server, src/index.js → 4000) и vite (cwd=root, 5173);
//   2. ждёт /api/health и 5173;
//   3. запускает node check-console.mjs;
//   4. гасит детей и выходит с кодом check-console.
import { spawn, execSync } from 'node:child_process'
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

async function main() {
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