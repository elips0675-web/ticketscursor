import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import knex from '../db.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { createWikiValidation } from '../validate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const wikiUploads = path.join(__dirname, '..', '..', 'uploads', 'wiki')
fs.mkdirSync(wikiUploads, { recursive: true })

const storage = multer.diskStorage({
  destination: wikiUploads,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, unique + '-' + file.originalname)
  },
})
const WIKI_ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/pdf']
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (WIKI_ALLOWED.includes(file.mimetype)) return cb(null, true)
    cb(new Error(`Недопустимый тип файла: ${file.mimetype}`))
  },
})

const router = Router()
router.use(authenticateToken)

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  const offset = (page - 1) * limit
  try {
    const [[{ total }]] = await knex.raw('SELECT COUNT(*) as total FROM wiki_articles')
    const [rows] = await knex.raw(
      'SELECT id, title, content, category, tags, author_id, author_name, created_at, updated_at FROM wiki_articles ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      [limit, offset],
    )
    res.json({ data: rows, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('Wiki list error:', err)
    res.status(500).json({ message: 'Failed to fetch articles' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const [[article]] = await knex.raw('SELECT * FROM wiki_articles WHERE id = ?', [req.params.id])
    if (!article) return res.status(404).json({ message: 'Article not found' })
    res.json(article)
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch article' })
  }
})

router.post('/', requireRole('admin', 'senior_agent'), createWikiValidation, async (req, res) => {
  const { title, content, category, tags } = req.body
  try {
    const [result] = await knex.raw(
      'INSERT INTO wiki_articles (title, content, category, tags, author_id, author_name) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, category || 'Другое', JSON.stringify(tags || []), req.user.userId, req.user.name || 'User'],
    )
    const [[article]] = await knex.raw('SELECT * FROM wiki_articles WHERE id = ?', [result.insertId])
    res.status(201).json(article)
  } catch (err) {
    console.error('Create article error:', err)
    res.status(500).json({ message: 'Failed to create article' })
  }
})

router.post('/upload-image', requireRole('admin', 'senior_agent'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
  const url = `/uploads/wiki/${req.file.filename}`
  res.json({ url })
})

export default router
