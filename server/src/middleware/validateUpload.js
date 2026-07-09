import { fileTypeFromFile } from 'file-type'
import fs from 'fs'
import logger from '../logger.js'
import { scanFile, CLAMAV_ENABLED } from '../clamav.js'

const ALLOWED = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf',
  'doc', 'docx', 'xls', 'xlsx',
  'zip', 'rar', 'gz', '7z', 'txt',
])

export function validateUpload(req, res, next) {
  const files = []
  if (req.file) files.push(req.file)
  if (req.files) {
    if (Array.isArray(req.files)) files.push(...req.files)
    else Object.values(req.files).forEach((arr) => files.push(...arr))
  }
  if (files.length === 0) return next()

  Promise.all(files.map(checkFile))
    .then((results) => {
      const bad = results.find((r) => !r.ok)
      if (bad) return res.status(400).json({ message: `Недопустимый тип файла: ${bad.name}` })
      next()
    })
    .catch(() => res.status(500).json({ message: 'File validation error' }))
}

async function checkFile(file) {
  try {
    const type = await fileTypeFromFile(file.path)
    if (!type) {
      fs.unlink(file.path, () => {})
      return { ok: false, name: file.originalname }
    }
    if (!ALLOWED.has(type.ext)) {
      fs.unlink(file.path, () => {})
      return { ok: false, name: file.originalname }
    }
    if (CLAMAV_ENABLED) {
      const result = await scanFile(file.path)
      if (!result.ok) {
        fs.unlink(file.path, () => {})
        return { ok: false, name: file.originalname }
      }
    }
    return { ok: true }
  } catch (err) {
    logger.warn('File check error:', err.message)
    fs.unlink(file.path, () => {})
    return { ok: false, name: file.originalname }
  }
}
