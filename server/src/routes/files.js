import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import pool from '../db.js'
import { authenticateToken } from '../middleware.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fileUploads = path.join(__dirname, '..', '..', 'uploads', 'files')
fs.mkdirSync(fileUploads, { recursive: true })

const storage = multer.diskStorage({
  destination: fileUploads,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, unique + '-' + file.originalname)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const router = Router()
router.use(authenticateToken)

router.get('/folders', async (req, res) => {
  try {
    const [folders] = await pool.query(
      'SELECT * FROM file_folders WHERE user_id = ? OR is_shared = 1 ORDER BY name',
      [req.user.userId],
    )
    for (const f of folders) {
      const [files] = await pool.query(
        'SELECT id, name, size, type, folder_id as folderId, path, created_at as createdAt FROM files WHERE folder_id = ? ORDER BY created_at DESC',
        [f.id],
      )
      f.files = files
    }
    res.json(folders)
  } catch (err) {
    console.error('Files list error:', err)
    res.status(500).json({ message: 'Failed to fetch files' })
  }
})

router.post('/folders', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: 'Name required' })
  try {
    const [result] = await pool.query(
      'INSERT INTO file_folders (name, user_id) VALUES (?, ?)',
      [name, req.user.userId],
    )
    const [[folder]] = await pool.query('SELECT * FROM file_folders WHERE id = ?', [result.insertId])
    res.status(201).json(folder)
  } catch (err) {
    console.error('Create folder error:', err)
    res.status(500).json({ message: 'Failed to create folder' })
  }
})

router.post('/upload', upload.single('file'), async (req, res) => {
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
    const [result] = await pool.query(
      'INSERT INTO files (name, size, type, folder_id, path, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, sizeKB, fileType, folderId || null, `/uploads/files/${req.file.filename}`, req.user.userId],
    )
    const [[file]] = await pool.query(
      'SELECT id, name, size, type, folder_id as folderId, path, created_at as createdAt FROM files WHERE id = ?',
      [result.insertId],
    )
    res.status(201).json(file)
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ message: 'Failed to upload file' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM files WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete file' })
  }
})

export default router
