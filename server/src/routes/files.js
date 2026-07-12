import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import prisma from '../prisma.js'
import { auditLogMiddleware } from '../audit.js'
import { authenticateToken, requireRole } from '../middleware.js'
import logger from '../logger.js'
import { validateUpload } from '../middleware/validateUpload.js'
import { saveFile } from '../storage.js'
import { getFolders, createFolder, createFile, deleteFile } from '../services/files.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fileUploads = path.join(__dirname, '..', '..', 'uploads', 'files')
fs.mkdirSync(fileUploads, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, fileUploads) },
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
router.use(auditLogMiddleware)
router.use(requireRole('agent'))

router.get('/folders', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  try {
    const folders = await getFolders(req.user.userId, page, limit)
    res.json({ success: true, data: folders })
  } catch (err) {
    logger.error('Files list error:', err)
    res.status(500).json({ message: 'Failed to fetch files' })
  }
})

router.post('/folders', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: 'Name required' })
  try {
    const folder = await createFolder(name, req.user.userId)
    res.status(201).json({ success: true, data: folder })
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
    const file = await createFile({
      name, size: sizeKB, type: fileType,
      folderId: folderId ? Number(folderId) : null,
      path: url, userId: req.user.userId,
    })
    res.status(201).json({ success: true, data: {
      id: file.id, name: file.name, size: file.size,
      type: file.type, folderId: file.folder_id,
      path: file.path, createdAt: file.created_at,
    } })
  } catch (err) {
    logger.error('Upload error:', err)
    res.status(500).json({ message: 'Failed to upload file' })
  }
})

router.delete('/:id', requireRole('admin', 'senior_agent'), async (req, res) => {
  try {
    const file = await prisma.files.findUnique({ where: { id: Number(req.params.id) } })
    if (!file) return res.status(404).json({ message: 'File not found' })
    await deleteFile(req.params.id)
    res.json({ success: true, data: { ok: true } })
  } catch {
    res.status(500).json({ message: 'Failed to delete file' })
  }
})

export default router
