// Этап 68: middleware/fileCheck.js — 0% → юнит-тесты.
// validateFileType + createFileCheckMiddleware (типы файлов, txt-fallback, unlink невалидных).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import { validateFileType, createFileCheckMiddleware } from '../middleware/fileCheck.js'

vi.mock('file-type', () => ({
  fileTypeFromFile: vi.fn(),
}))

import { fileTypeFromFile } from 'file-type'

describe('fileCheck.js — middleware/fileCheck (Этап 68)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(fs, 'unlink').mockImplementation((_path, cb) => {
      if (typeof cb === 'function') cb(null)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateFileType', () => {
    it('разрешает файлы из ALLOWED_EXTENSIONS', async () => {
      fileTypeFromFile.mockResolvedValue({ ext: 'png', mime: 'image/png' })
      expect(await validateFileType('/tmp/a.png')).toBe(true)
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('отклоняет неизвестное расширение и удаляет файл', async () => {
      fileTypeFromFile.mockResolvedValue({ ext: 'exe', mime: 'application/x-msdownload' })
      expect(await validateFileType('/tmp/a.exe')).toBe(false)
      expect(fs.unlink).toHaveBeenCalledWith('/tmp/a.exe', expect.any(Function))
    })

    it('txt проходит, когда file-type не определяет тип', async () => {
      fileTypeFromFile.mockResolvedValue(null)
      expect(await validateFileType('/tmp/notes.txt')).toBe(true)
    })

    it('не-txt при отсутствии определения типа — отклоняется и файл удаляется', async () => {
      fileTypeFromFile.mockResolvedValue(null)
      expect(await validateFileType('/tmp/archive.zip')).toBe(false)
      expect(fs.unlink).toHaveBeenCalledWith('/tmp/archive.zip', expect.any(Function))
    })

    it('исключение file-type → false', async () => {
      fileTypeFromFile.mockRejectedValue(new Error('ENOENT'))
      expect(await validateFileType('/tmp/missing.png')).toBe(false)
    })
  })

  describe('createFileCheckMiddleware', () => {
    function makeRes() {
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      return res
    }

    it('вызывает next, если все файлы валидны', async () => {
      fileTypeFromFile.mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' })
      const mw = createFileCheckMiddleware(['document'])
      const req = { files: { document: [{ path: '/tmp/d.pdf', originalname: 'doc.pdf' }] } }
      const res = makeRes()
      const next = vi.fn()
      await mw(req, res, next)
      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('возвращает 400 с именем файла, если тип невалиден', async () => {
      fileTypeFromFile.mockResolvedValue({ ext: 'html', mime: 'text/html' })
      const mw = createFileCheckMiddleware(['document'])
      const req = { files: { document: [{ path: '/tmp/x.html', originalname: 'page.html' }] } }
      const res = makeRes()
      const next = vi.fn()
      await mw(req, res, next)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('page.html') }))
      expect(next).not.toHaveBeenCalled()
    })

    it('работает с одиночным req.file', async () => {
      fileTypeFromFile.mockResolvedValue({ ext: 'png', mime: 'image/png' })
      const mw = createFileCheckMiddleware(['avatar'])
      const req = { file: { avatar: { path: '/tmp/a.png', originalname: 'a.png' } } }
      const res = makeRes()
      const next = vi.fn()
      await mw(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('останавливается на первом невалидном из нескольких файлов', async () => {
      fileTypeFromFile
        .mockResolvedValueOnce({ ext: 'png', mime: 'image/png' })
        .mockResolvedValueOnce({ ext: 'exe', mime: 'application/x-msdownload' })
      const mw = createFileCheckMiddleware(['attachments'])
      const req = {
        files: {
          attachments: [
            { path: '/tmp/ok.png', originalname: 'ok.png' },
            { path: '/tmp/bad.exe', originalname: 'bad.exe' },
          ],
        },
      }
      const res = makeRes()
      const next = vi.fn()
      await mw(req, res, next)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('bad.exe') }))
      expect(next).not.toHaveBeenCalled()
    })
  })
})