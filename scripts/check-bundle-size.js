import { readFileSync, statSync } from 'fs'
import { gzipSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const budgets = {
  'assets/index-*.js': { max: 400 * 1024, label: 'Initial JS' },
  'assets/index-*.css': { max: 50 * 1024, label: 'Initial CSS' },
}

const { globSync } = await import('tinyglobby')

let failed = false
for (const [pattern, { max, label }] of Object.entries(budgets)) {
  const files = globSync([pattern], { cwd: dist })
  for (const file of files) {
    const content = readFileSync(join(dist, file))
    const gzipped = gzipSync(content).length
    const ok = gzipped <= max
    if (!ok) failed = true
    console.log(`${ok ? '✓' : '✗'} ${label} (${file}): ${(gzipped / 1024).toFixed(1)} KB / ${(max / 1024).toFixed(0)} KB${ok ? '' : ' — OVER BUDGET'}`)
  }
}

const totalJs = globSync(['assets/*.js'], { cwd: dist })
  .reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length, 0)
const totalCss = globSync(['assets/*.css'], { cwd: dist })
  .reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length, 0)

console.log(`\nTotal JS (gzip): ${(totalJs / 1024).toFixed(1)} KB`)
console.log(`Total CSS (gzip): ${(totalCss / 1024).toFixed(1)} KB`)

if (failed) {
  console.error('\n❌ Bundle size budget exceeded!')
  process.exit(1)
}
