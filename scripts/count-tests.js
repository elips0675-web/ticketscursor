#!/usr/bin/env node
/**
 * Test inventory script — generates accurate test counts for AI auditors.
 * Run: node scripts/count-tests.js
 * Output: JSON + human-readable table
 */
const fs = require('fs')
const path = require('path')

function findTestFiles(dir, pattern) {
  const results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.includes('node_modules')) {
      results.push(...findTestFiles(fullPath, pattern))
    } else if (pattern.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

function countTestsInFiles(files) {
  let totalTests = 0
  let totalSuites = 0
  const inv = []

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const itMatches = content.match(/\b(it|test)\s*\(/g)
    const describeMatches = content.match(/\bdescribe\s*\(/g)
    const itCount = itMatches ? itMatches.length : 0
    const descCount = describeMatches ? describeMatches.length : 0
    totalTests += itCount
    totalSuites += descCount
    const rel = filePath.replace(/\\/g, '/').replace(/.*repo\//, '')
    inv.push({ file: rel, tests: itCount, suites: descCount })
  }

  inv.sort((a, b) => b.tests - a.tests)
  return { files: files.length, suites: totalSuites, tests: totalTests, inventory: inv }
}

const root = path.resolve(__dirname, '..')

// Frontend
const feFiles = findTestFiles(path.join(root, 'src/test'), /\.(test\.ts|test\.tsx)$/)
const fe = countTestsInFiles(feFiles)

// Server
const seFiles = findTestFiles(path.join(root, 'server/src'), /\.test\.js$/)
const se = countTestsInFiles(seFiles)

console.log('=== TEST INVENTORY ===')
console.log(`Frontend: ${fe.files} files, ${fe.suites} suites, ${fe.tests} tests`)
console.log(`Server:   ${se.files} files, ${se.suites} suites, ${se.tests} tests`)
console.log(`Total:    ${fe.files + se.files} files, ${fe.suites + se.suites} suites, ${fe.tests + se.tests} tests`)
console.log('')
console.log('Generated:', new Date().toISOString())

// Write JSON inventory
const inventory = {
  generated: new Date().toISOString(),
  tool: 'node scripts/count-tests.js',
  frontend: { files: fe.files, suites: fe.suites, tests: fe.tests },
  server: { files: se.files, suites: se.suites, tests: se.tests },
  total: { files: fe.files + se.files, suites: fe.suites + se.suites, tests: fe.tests + se.tests },
  frontend_files: fe.inventory,
  server_files: se.inventory,
}

const outPath = path.join(root, 'test-analysis', 'test-inventory.json')
fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2))
console.log(`Written to: ${outPath}`)
