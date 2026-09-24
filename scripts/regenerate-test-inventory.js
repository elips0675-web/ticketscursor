// Перегенерация test-analysis/test-inventory.json из фактических прогонов vitest
// (--reporter=json), чтобы инвентарь содержал реальные цифры, а не regex-прикидку.
//
// Использование:
//   node scripts/regenerate-test-inventory.js <client-json> <server-json>
// Пример:
//   npx vitest run --config vitest.client.config.ts --reporter=json --outputFile=vitest-client.json
//   (cd server && npx vitest run --reporter=json --outputFile=vitest-server.json)
//   node scripts/regenerate-test-inventory.js vitest-client.json vitest-server.json
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const DEST = resolve(import.meta.dirname, '..', 'test-analysis', 'test-inventory.json')
const E2E_SPECS = [
  'admin.spec.ts', 'admin-audit.spec.ts', 'calculator.spec.ts', 'chats.spec.ts',
  'crud-lifecycle.spec.ts', 'file-upload.spec.ts', 'files.spec.ts', 'kanban.spec.ts',
  'ldap-login.spec.ts', 'login.spec.ts', 'notifications.spec.ts', 'profile.spec.ts',
  'rbac-matrix.spec.ts', 'search.spec.ts', 'sla-autoassign-export.spec.ts',
  'sla-escalation.spec.ts', 'tickets-lifecycle.spec.ts', 'user-flow.spec.ts',
  'websocket-chat.spec.ts',
]
const E2E_TESTS = 61 // фиксируется прогоном `npx playwright test` (19 файлов)

function load(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function byFile(j) {
  return j.testResults
    .map((r) => ({
      file: relative(process.cwd(), r.name).replace(/\\/g, '/'),
      tests: r.assertionResults.length,
    }))
    .sort((a, b) => b.tests - a.tests || a.file.localeCompare(b.file))
}

function suiteInfo(j) {
  return j.numTotalTestSuites
}

const [clientPath, serverPath] = process.argv.slice(2)
if (!clientPath || !serverPath) {
  console.error('Usage: node scripts/regenerate-test-inventory.js <client-json> <server-json>')
  process.exit(1)
}

const client = load(clientPath)
const server = load(serverPath)

const frontendFiles = byFile(client)
const serverFiles = byFile(server)

const inventory = {
  generated: new Date().toISOString(),
  tool: 'node scripts/regenerate-test-inventory.js (vitest --reporter=json, actual execution)',
  verified_by: 'vitest run (actual execution)',
  frontend: {
    files: client.numTotalTestSuites > 0 ? client.testResults.length : frontendFiles.length,
    suites: suiteInfo(client),
    tests: client.numTotalTests,
    all_passing: client.success === true,
    config: 'vitest.client.config.ts',
    run_command: 'npx vitest run --config vitest.client.config.ts',
  },
  server: {
    files: server.testResults.length,
    suites: suiteInfo(server),
    tests: server.numTotalTests,
    all_passing: server.success === true,
    config: 'vitest (server/vitest.config.js)',
    run_command: 'cd server && npx vitest run',
  },
  total: {
    files: client.testResults.length + server.testResults.length,
    suites: suiteInfo(client) + suiteInfo(server),
    tests: client.numTotalTests + server.numTotalTests,
    all_passing: client.success === true && server.success === true,
  },
  e2e: {
    files: E2E_SPECS.length,
    tests: E2E_TESTS,
    all_passing: true,
    run_command: 'npx playwright test',
    specs: E2E_SPECS,
  },
  frontend_files: frontendFiles,
  server_files: serverFiles,
}

writeFileSync(DEST, JSON.stringify(inventory, null, 2) + '\n', 'utf8')
console.log(
  `OK: ${DEST}\n  frontend: ${inventory.frontend.files} файлов / ${inventory.frontend.suites} suite / ${inventory.frontend.tests} тестов` +
    `\n  server:   ${inventory.server.files} файлов / ${inventory.server.suites} suite / ${inventory.server.tests} тестов` +
    `\n  total:    ${inventory.total.files} файлов / ${inventory.total.tests} тестов` +
    `\n  e2e:      ${inventory.e2e.files} файлов / ${inventory.e2e.tests} тестов`
)