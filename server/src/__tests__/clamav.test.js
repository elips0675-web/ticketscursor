import { describe, it, expect, vi } from 'vitest'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('../logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn() } }))

describe('clamav.js', () => {
  beforeEach(() => {
    delete process.env.CLAMAV_ENABLED
    vi.resetModules()
  })

  it('skips scan when CLAMAV_ENABLED is not true', async () => {
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/some/file.pdf')
    expect(result).toEqual({ ok: true })
  })

  it('fails closed when file does not exist', async () => {
    process.env.CLAMAV_ENABLED = 'true'
    const { scanFile } = await import('../clamav.js')
    const result = await scanFile('/nonexistent/file.pdf')
    expect(result).toEqual({ ok: false, reason: 'Scanner unavailable' })
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
