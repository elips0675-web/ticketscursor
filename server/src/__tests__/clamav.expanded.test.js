import { describe, it, expect, vi } from 'vitest'
import EventEmitter from 'events'

const mockSpawn = vi.hoisted(() => vi.fn())
const mockLogger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }))

vi.mock('child_process', () => ({ spawn: mockSpawn }))
vi.mock('fs', () => ({ default: { existsSync: vi.fn().mockReturnValue(true) } }))
vi.mock('../logger.js', () => ({ default: mockLogger }))

function makeMockProcess({ exitCode, stdout, stderr, spawnError }) {
  const proc = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  if (stdout) setTimeout(() => proc.stdout.emit('data', Buffer.from(stdout)), 0)
  if (stderr) setTimeout(() => proc.stderr.emit('data', Buffer.from(stderr)), 0)
  if (spawnError) {
    setTimeout(() => proc.emit('error', spawnError), 0)
  } else {
    setTimeout(() => proc.emit('close', exitCode), 5)
  }
  return proc
}

describe('clamav.js', () => {
  beforeEach(() => {
    delete process.env.CLAMAV_ENABLED
    mockSpawn.mockReset()
    mockLogger.warn.mockReset()
    mockLogger.error.mockReset()
    vi.resetModules()
  })

  it('skips scan when CLAMAV_ENABLED is not true', async () => {
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/some/file.pdf')
    expect(result).toEqual({ ok: true })
  })

  it('fails closed when file does not exist', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    const fsMod = await import('fs')
    fsMod.default.existsSync.mockReturnValueOnce(false)
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/nonexistent/file.pdf')
    expect(result).toEqual({ ok: false, reason: 'Scanner unavailable' })
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('returns ok when clamdscan exits with code 0', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }))
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/clean/file.pdf')
    expect(result).toEqual({ ok: true })
  })

  it('detects virus when clamdscan exits with code 1', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 1, stdout: 'Virus found' }))
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/malicious/file.pdf')
    expect(result).toEqual({ ok: false, reason: 'Virus detected' })
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('fails closed on clamdscan error exit code', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 2, stderr: 'error msg' }))
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/error/file.pdf')
    expect(result).toEqual({ ok: false, reason: 'Scanner unavailable' })
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('fails closed on spawn error', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    mockSpawn.mockReturnValue(makeMockProcess({ spawnError: new Error('spawn failed') }))
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/spawn-error/file.pdf')
    expect(result).toEqual({ ok: false, reason: 'Scanner unavailable' })
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('clamavStatus: dev/test без CLAMAV_ENABLED — ok, но не обязателен', async () => {
    const { clamavStatus } = await import('../clamav.js')
    expect(clamavStatus()).toEqual({ enabled: false, required: false, ok: true })
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('clamavStatus: production без CLAMAV_ENABLED — not ok', async () => {
    const saved = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { clamavStatus } = await import('../clamav.js')
      expect(clamavStatus()).toEqual({ enabled: false, required: true, ok: false })
      expect(mockLogger.error).toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = saved
    }
  })

  it('clamavStatus: production с CLAMAV_ENABLED — ok', async () => {
    const saved = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    process.env.CLAMAV_ENABLED = 'true'
    try {
      const { clamavStatus } = await import('../clamav.js')
      expect(clamavStatus()).toEqual({ enabled: true, required: true, ok: true })
    } finally {
      process.env.NODE_ENV = saved
    }
  })

  it('exports CLAMAV_ENABLED as false by default', async () => {
    const mod = await import('../clamav.js')
    expect(mod.CLAMAV_ENABLED).toBe(false)
  })

  it('exports CLAMAV_ENABLED as true when env set', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    const mod = await import('../clamav.js')
    expect(mod.CLAMAV_ENABLED).toBe(true)
  })
})
