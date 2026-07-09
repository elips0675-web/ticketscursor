import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import knex from '../db.js'
import { authenticateToken } from '../middleware.js'
import logger from '../logger.js'
import { validateUpload } from '../middleware/validateUpload.js'
import { saveFile, S3_ENABLED } from '../storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fileUploads = path.join(__dirname, '..', '..', 'uploads', 'files')
fs.mkdirSync(fileUploads, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fileUploads)
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, unique + '-' + file.originalname)
  },
})
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'application/zip', 'application/x-rar-compressed', 'application/gzip']
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true)
    cb(new Error(`Недопустимый тип файла: ${file.mimetype}`))
  },
})

const router = Router()
router.use(authenticateToken)

router.get('/folders', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  const offset = (page - 1) * limit
  try {
    const [folders] = await knex.raw(
      'SELECT * FROM file_folders WHERE user_id = ? OR is_shared = 1 ORDER BY name',
      [req.user.userId],
    )
    for (const f of folders) {
      const [files] = await knex.raw(
        'SELECT id, name, size, type, folder_id as folderId, path, created_at as createdAt FROM files WHERE folder_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [f.id, limit, offset],
      )
      f.files = files
      const [[{ total }]] = await knex.raw('SELECT COUNT(*) as total FROM files WHERE folder_id = ?', [f.id])
      f.totalFiles = total
    }
    res.json(folders)
  } catch (err) {
    logger.error('Files list error:', err)
    res.status(500).json({ message: 'Failed to fetch files' })
  }
})

router.post('/folders', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: 'Name required' })
  try {
    const [result] = await knex.raw(
      'INSERT INTO file_folders (name, user_id) VALUES (?, ?)',
      [name, req.user.userId],
    )
    const [[folder]] = await knex.raw('SELECT * FROM file_folders WHERE id = ?', [result.insertId])
    res.status(201).json(folder)
  } catch (err) {
    logger.error('Create folder error:', err)
    res.status(500).json({ message: 'Failed to create folder' })
  }
})

router.post('/upload', upload.single('file'), validateUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Файл не загружен' })
  const { folderId } = req.body
  const name = req.file.originalname
  const ext = path.extname(name).toLowerCase().replace('.', '')
  const typeMap = { png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', svg: 'img', pdf: 'pdf', doc: 'doc', docx: 'doc', xls: 'doc', xlsx: 'doc', ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', sh: 'code', css: 'code', html: 'code' }
  const fileType = typeMap[ext] || 'file'
  const sizeKB = req.file.size > 1024 * 1024
    ? (req.file.size / 1024 / 1024).toFixed(1) + ' MB'
    : (req.file.size / 1024).toFixed(req.file.size > 1024 ? 1 : 0) + ' KB'
  try {
    const buffer = fs.readFileSync(req.file.path)
    const { url } = await saveFile('files', req.file.filename, buffer)
    const [result] = await knex.raw(
      'INSERT INTO files (name, size, type, folder_id, path, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, sizeKB, fileType, folderId || null, url, req.user.userId],
    )
    const [[file]] = await knex.raw(
      'SELECT id, name, size, type, folder_id as folderId, path, created_at as createdAt FROM files WHERE id = ?',
      [result.insertId],
    )
    res.status(201).json(file)
  } catch (err) {
    logger.error('Upload error:', err)
    res.status(500).json({ message: 'Failed to upload file' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await knex.raw('DELETE FROM files WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete file' })
  }
})

export default router
