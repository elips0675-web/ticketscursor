import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../logger.js', () => ({ default: { warn: vi.fn() } }))

vi.mock('../clamav.js', () => ({
  scanFile: vi.fn().mockResolvedValue({ ok: true }),
  clamavStatus: vi.fn().mockReturnValue({ enabled: false, required: false, ok: true }),
  CLAMAV_ENABLED: false,
}))

vi.mock('file-type', () => ({
  fileTypeFromFile: vi.fn(),
}))

describe('validateUpload middleware', () => {
  let validateUpload, fileTypeFromFile

  beforeEach(async () => {
    vi.resetModules()
    const ft = await import('file-type')
    fileTypeFromFile = ft.fileTypeFromFile
    const mod = await import('../middleware/validateUpload.js')
    validateUpload = mod.validateUpload
  })

  function mockReqRes(file) {
    const req = file ? { file, files: undefined } : { file: undefined, files: undefined }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    return { req, res, next }
  }

  it('calls next when no files', () => {
    const { req, res, next } = mockReqRes(undefined)
    validateUpload(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('passes valid file type', async () => {
    fileTypeFromFile.mockResolvedValue({ ext: 'pdf' })
    const file = { path: '/tmp/test.pdf', originalname: 'test.pdf' }
    const { req, res, next } = mockReqRes(file)
    validateUpload(req, res, next)
    await new Promise(r => setTimeout(r, 10))
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalledWith(400)
  })

  it('rejects invalid file type', async () => {
    fileTypeFromFile.mockResolvedValue({ ext: 'exe' })
    const file = { path: '/tmp/virus.exe', originalname: 'virus.exe' }
    const { req, res, next } = mockReqRes(file)
    validateUpload(req, res, next)
    await new Promise(r => setTimeout(r, 10))
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVALID_FILE_TYPE',
      message: expect.stringContaining('virus.exe'),
    })
  })

  it('handles files array', async () => {
    fileTypeFromFile.mockResolvedValue({ ext: 'jpg' })
    const req = { file: undefined, files: [{ path: '/tmp/a.jpg', originalname: 'a.jpg' }] }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    validateUpload(req, res, next)
    await new Promise(r => setTimeout(r, 10))
    expect(next).toHaveBeenCalled()
  })

  it('handles files object (multer group)', async () => {
    fileTypeFromFile.mockResolvedValue({ ext: 'png' })
    const req = { file: undefined, files: { docs: [{ path: '/tmp/i.png', originalname: 'i.png' }] } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    validateUpload(req, res, next)
    await new Promise(r => setTimeout(r, 10))
    expect(next).toHaveBeenCalled()
  })

  it('rejects when fileTypeFromFile returns null (unknown type)', async () => {
    fileTypeFromFile.mockResolvedValue(null)
    const file = { path: '/tmp/unknown.bin', originalname: 'unknown.bin' }
    const { req, res, next } = mockReqRes(file)
    validateUpload(req, res, next)
    await new Promise(r => setTimeout(r, 10))
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('rejects when fileTypeFromFile throws', async () => {
    fileTypeFromFile.mockRejectedValue(new Error('read error'))
    const file = { path: '/tmp/broken.pdf', originalname: 'broken.pdf' }
    const { req, res, next } = mockReqRes(file)
    validateUpload(req, res, next)
    await new Promise(r => setTimeout(r, 10))
    expect(res.status).toHaveBeenCalledWith(400)
  })
})
