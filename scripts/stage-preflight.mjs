// stage:preflight — быстрые гейты ДО начала работы (перенос идеи из «ЗАДАНИЕ
// АГЕНТУ.txt» SwiftMatch 21.10.2026, автоматизация B).
//
// Прогоняет дешёвые статические проверки последовательно и печатает итоговый
// PASS/FAIL по каждой, вместо «агент догадывается, что запустить». Красный
// preflight = починить до начала работы, а не после, когда накопились правки.
//
// В составе (все — существующие npm-скрипты, ничего не дублируется):
//   1. check:docs   — зеркала + закрытые записи + счётчики + структура бэклога;
//   2. lint         — eslint;
//   3. type-check   — tsc --noEmit.
//
// Всё — статические проверки без БД и без живого стенда. Сознательно ВНЕ
// preflight: check:migrations-lag (живая сверка с knex_migrations падает
// без рабочей БД servicedesk — он идёт по карте stage:gates при правке
// server/migrations), npm test, build, check:console, E2E — они идут в конце
// этапа (см. prompts.md, «Универсальный промт»).
//
// Использование:
//   npm run stage:preflight     (или node scripts/stage-preflight.mjs)
//   exit 0 — все проверки зелёные; exit 1 — есть красные (список в конце).

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const PREFLIGHT_STEPS = [
  { name: 'check:docs', args: ['run', 'check:docs'] },
  { name: 'lint', args: ['run', 'lint'] },
  { name: 'type-check', args: ['run', 'type-check'] },
]

function runNpm(args) {
  // На Windows npm — это npm.cmd, который напрямую (без shell) не спавнится.
  // Вызываем через cmd.exe /c с массивом аргументов: ни shell:true (там Node
  // требует конкатенации и ругается DEP0190), ни склейки строк.
  const isWin = process.platform === 'win32'
  const cmd = isWin ? 'cmd.exe' : 'npm'
  const cmdArgs = isWin ? ['/c', 'npm', ...args] : args
  const res = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (res.error) return { code: 1, out: String(res.error) }
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

function main() {
  const failed = []
  for (const step of PREFLIGHT_STEPS) {
    process.stdout.write(`[preflight] ${step.name} … `)
    const { code, out } = runNpm(step.args)
    if (code === 0) {
      console.log('PASS')
    } else {
      console.log('FAIL')
      const tail = out.split(/\r?\n/).filter(Boolean).slice(-15)
      for (const l of tail) console.log(`    ${l}`)
      failed.push(step.name)
    }
  }
  if (failed.length > 0) {
    console.log(`\n[preflight] FAIL — ${failed.length} из ${PREFLIGHT_STEPS.length} красные: ${failed.join(', ')}.`)
    console.log('[preflight] Починить ДО начала работы, а не после накопления правок.')
    process.exit(1)
  }
  console.log(`\n[preflight] PASS — все ${PREFLIGHT_STEPS.length} проверки зелёные.`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
