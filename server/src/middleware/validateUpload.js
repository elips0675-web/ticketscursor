import { fileTypeFromFile } from 'file-type'
import fs from 'fs'
import logger from '../logger.js'
import { scanFile, clamavStatus } from '../clamav.js'

const ALLOWED = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf',
  'doc', 'docx', 'xls', 'xlsx',
  'zip', 'rar', 'gz', '7z', 'txt',
])

function collectFiles(req) {
  const files = []
  if (req.file) files.push(req.file)
  if (req.files) {
    if (Array.isArray(req.files)) files.push(...req.files)
    else Object.values(req.files).forEach((arr) => files.push(...arr))
  }
  return files
}

function cleanup(files) {
  for (const file of files) {
    if (file?.path) fs.unlink(file.path, () => {})
  }
}

export function validateUpload(req, res, next) {
  const files = collectFiles(req)
  if (files.length === 0) return next()

  const clamav = clamavStatus()
  if (!clamav.ok) {
    cleanup(files)
    return res.status(503).json({
      code: 'CLAMAV_UNAVAILABLE',
      message: 'Загрузка файлов недоступна: антивирус не настроен',
    })
  }

  Promise.all(files.map((file) => checkFile(file, clamav.enabled)))
    .then((results) => {
      const bad = results.find((r) => !r.ok)
      if (!bad) return next()

      cleanup(files)
      if (bad.code === 'CLAMAV_UNAVAILABLE') {
        return res.status(503).json({
          code: 'CLAMAV_UNAVAILABLE',
          message: 'Загрузка файлов недоступна: антивирус не отвечает',
        })
      }
      return res.status(400).json({
        code: bad.code,
        message: `Недопустимый тип файла: ${bad.name}`,
      })
    })
    .catch(() => {
      cleanup(files)
      res.status(500).json({ message: 'File validation error' })
    })
}

async function checkFile(file, scanEnabled) {
  try {
    const type = await fileTypeFromFile(file.path)
    if (!type || !ALLOWED.has(type.ext)) {
      return { ok: false, code: 'INVALID_FILE_TYPE', name: file.originalname }
    }
    if (scanEnabled) {
      const result = await scanFile(file.path)
      if (!result.ok) {
        const code = result.reason === 'Virus detected' ? 'VIRUS_DETECTED' : 'CLAMAV_UNAVAILABLE'
        return { ok: false, code, name: file.originalname }
      }
    }
    return { ok: true }
  } catch (err) {
    logger.warn('File check error:', err.message)
    return { ok: false, code: 'INVALID_FILE_TYPE', name: file.originalname }
  }
}
