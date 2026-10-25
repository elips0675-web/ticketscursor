import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import winston from 'winston'

import { fileTransportOptions, LOG_MAX_SIZE_BYTES, LOG_MAX_FILES } from '../logger.js'

const tempDirs = []

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-logger-'))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe('logger: ротация файлов', () => {
  it('опции транспорта задают maxsize числом байт, а не maxSize строкой', () => {
    const options = fileTransportOptions('logs')
    expect(options).toHaveLength(2)
    for (const entry of options) {
      expect(entry).not.toHaveProperty('maxSize')
      expect(typeof entry.maxsize).toBe('number')
      expect(entry.maxsize).toBe(LOG_MAX_SIZE_BYTES)
      expect(entry.maxFiles).toBe(LOG_MAX_FILES)
    }
    expect(options[0].level).toBe('error')
    expect(options[1].level).toBeUndefined()
  })

  it('winston ротирует файл по maxsize и держит не больше maxFiles файлов', async () => {
    const dir = tempDir()
    const maxsize = 2048
    const maxFiles = 3
    const logger = winston.createLogger({
      transports: fileTransportOptions(dir, { maxsize, maxFiles }).map(
        (options) => new winston.transports.File(options),
      ),
    })

    const record = 'x'.repeat(100)
    for (let i = 0; i < 60; i++) logger.info(`${record}${i}`)
    await new Promise((resolve) => setTimeout(resolve, 500))
    logger.close()

    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.log'))
    const sizes = files.map((name) => fs.statSync(path.join(dir, name)).size)
    expect(files.length).toBeGreaterThan(1)
    expect(files.length).toBeLessThanOrEqual(maxFiles)
    for (const size of sizes) expect(size).toBeLessThanOrEqual(maxsize + 400)
    expect(Math.max(...sizes)).toBeLessThan(maxsize * maxFiles)
  })
})
