import { describe, it, expect, vi, beforeEach } from 'vitest'

const fileTypeMock = vi.hoisted(() => vi.fn())
vi.mock('file-type', () => ({ fileTypeFromFile: fileTypeMock }))

const fsMock = vi.hoisted(() => ({ unlink: vi.fn() }))
vi.mock('fs', () => ({ default: fsMock }))

const clamavMock = vi.hoisted(() => ({ scanFile: vi.fn(), clamavStatus: vi.fn() }))
vi.mock('../clamav.js', () => ({
  scanFile: clamavMock.scanFile,
  clamavStatus: clamavMock.clamavStatus,
}))

vi.mock('../logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { validateUpload } from '../middleware/validateUpload.js'

const FILE = { path: 'tmp/upload-1', originalname: 'doc.pdf' }

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: vi.fn((code) => {
      res.statusCode = code
      return res
    }),
    json: vi.fn((body) => {
      res.body = body
      return res
    }),
  }
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  fileTypeMock.mockResolvedValue({ ext: 'pdf' })
  clamavMock.scanFile.mockResolvedValue({ ok: true })
  clamavMock.clamavStatus.mockReturnValue({ enabled: true, required: true, ok: true })
})

describe('validateUpload — CHW-05', () => {
  it('production без ClamAV → 503, temp-файл удалён, обработчик не вызван', async () => {
    clamavMock.clamavStatus.mockReturnValue({ enabled: false, required: true, ok: false })
    const req = { file: FILE }
    const res = makeRes()
    const next = vi.fn()

    validateUpload(req, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('CLAMAV_UNAVAILABLE')
    expect(next).not.toHaveBeenCalled()
    expect(fsMock.unlink).toHaveBeenCalledWith(FILE.path, expect.any(Function))
    expect(fileTypeMock).not.toHaveBeenCalled()
  })

  it('dev/test без ClamAV → пропуск без сканирования', async () => {
    clamavMock.clamavStatus.mockReturnValue({ enabled: false, required: false, ok: true })
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalled())

    expect(next).toHaveBeenCalledTimes(1)
    expect(clamavMock.scanFile).not.toHaveBeenCalled()
    expect(fsMock.unlink).not.toHaveBeenCalled()
  })

  it('чистый файл при включённом ClamAV → next', async () => {
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalled())

    expect(clamavMock.scanFile).toHaveBeenCalledWith(FILE.path)
    expect(fsMock.unlink).not.toHaveBeenCalled()
  })

  it('вирус → 400 VIRUS_DETECTED, файл удалён', async () => {
    clamavMock.scanFile.mockResolvedValue({ ok: false, reason: 'Virus detected' })
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('VIRUS_DETECTED')
    expect(next).not.toHaveBeenCalled()
    expect(fsMock.unlink).toHaveBeenCalled()
  })

  it('сканер не отвечает → 503, а не 400', async () => {
    clamavMock.scanFile.mockResolvedValue({ ok: false, reason: 'Scanner unavailable' })
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('CLAMAV_UNAVAILABLE')
    expect(next).not.toHaveBeenCalled()
  })

  it('недопустимый тип → 400 INVALID_FILE_TYPE без сканирования', async () => {
    fileTypeMock.mockResolvedValue({ ext: 'exe' })
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_TYPE')
    expect(clamavMock.scanFile).not.toHaveBeenCalled()
  })

  it('неизвестный тип (file-type вернул undefined) → 400', async () => {
    fileTypeMock.mockResolvedValue(undefined)
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_TYPE')
  })

  it('ошибка определения типа → 400, файл удалён', async () => {
    fileTypeMock.mockRejectedValue(new Error('read error'))
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ file: FILE }, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_TYPE')
    expect(fsMock.unlink).toHaveBeenCalled()
  })

  it('несколько файлов, один плохой → удаляются все', async () => {
    fileTypeMock.mockResolvedValueOnce({ ext: 'pdf' }).mockResolvedValueOnce({ ext: 'exe' })
    const second = { path: 'tmp/upload-2', originalname: 'bad.exe' }
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ files: [FILE, second] }, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalled())

    expect(res.statusCode).toBe(400)
    expect(fsMock.unlink).toHaveBeenCalledWith(FILE.path, expect.any(Function))
    expect(fsMock.unlink).toHaveBeenCalledWith(second.path, expect.any(Function))
  })

  it('multer.fields (объект массивов) → файлы собираются', async () => {
    const res = makeRes()
    const next = vi.fn()

    validateUpload({ files: { attachment: [FILE] } }, res, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalled())

    expect(clamavMock.scanFile).toHaveBeenCalledWith(FILE.path)
  })

  it('нет файлов → next без проверок', () => {
    const res = makeRes()
    const next = vi.fn()

    validateUpload({}, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(clamavMock.clamavStatus).not.toHaveBeenCalled()
  })
})
