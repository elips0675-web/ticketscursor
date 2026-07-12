import { Router } from 'express'
import prisma from '../prisma.js'
import { authenticateToken, requireRole } from '../middleware.js'
import logger from '../logger.js'
import { searchMeilisearch } from '../search-sync.js'

const router = Router()
router.use(authenticateToken)
router.use(requireRole('agent'))

function toPlain(v) {
  return JSON.parse(JSON.stringify(v, (_k, val) => typeof val === 'bigint' ? Number(val) : val))
}

router.get('/', async (req, res) => {
  const q = req.query.q?.trim()
  if (!q || q.length < 2) {
    return res.json({ success: true, data: { tickets: [], employees: [], wiki: [], news: [], chats: [], files: [] } })
  }

  const meili = await searchMeilisearch(q)
  if (meili) {
    return res.json({ success: true, data: meili })
  }

  try {
    const tickets = await prisma.$queryRaw`
      SELECT id, title, status, priority, created_at FROM tickets
      WHERE MATCH(title, description) AGAINST(${q + '*'} IN BOOLEAN MODE)
      ORDER BY updated_at DESC LIMIT 10
    `
    const employees = await prisma.$queryRaw`
      SELECT id, name, email, department, avatar FROM employees
      WHERE MATCH(name, email, department) AGAINST(${q + '*'} IN BOOLEAN MODE) LIMIT 10
    `
    const wiki = await prisma.$queryRaw`
      SELECT id, title, category, created_at FROM wiki_articles
      WHERE MATCH(title, content) AGAINST(${q + '*'} IN BOOLEAN MODE)
      ORDER BY updated_at DESC LIMIT 10
    `
    const news = await prisma.$queryRaw`
      SELECT id, title, created_at FROM news_posts
      WHERE MATCH(title, content) AGAINST(${q + '*'} IN BOOLEAN MODE)
      ORDER BY created_at DESC LIMIT 10
    `
    const chats = await prisma.$queryRaw`
      SELECT id, name, type FROM chat_rooms
      WHERE MATCH(name) AGAINST(${q + '*'} IN BOOLEAN MODE) LIMIT 10
    `
    const files = await prisma.$queryRaw`
      SELECT id, name, size, type, created_at FROM files
      WHERE MATCH(name) AGAINST(${q + '*'} IN BOOLEAN MODE)
      ORDER BY created_at DESC LIMIT 10
    `
    res.json({ success: true, data: toPlain({ tickets, employees, wiki, news, chats, files }) })
  } catch (err) {
    logger.warn('FULLTEXT search failed, falling back to LIKE:', err.message)
    const like = `%${q}%`
    try {
      const tickets = await prisma.$queryRaw`
        SELECT id, title, status, priority, created_at FROM tickets WHERE title LIKE ${like} OR description LIKE ${like} ORDER BY updated_at DESC LIMIT 10
      `
      const employees = await prisma.$queryRaw`
        SELECT id, name, email, department, avatar FROM employees WHERE name LIKE ${like} OR email LIKE ${like} OR department LIKE ${like} LIMIT 10
      `
      const wiki = await prisma.$queryRaw`
        SELECT id, title, category, created_at FROM wiki_articles WHERE title LIKE ${like} OR content LIKE ${like} ORDER BY updated_at DESC LIMIT 10
      `
      const news = await prisma.$queryRaw`
        SELECT id, title, created_at FROM news_posts WHERE title LIKE ${like} OR content LIKE ${like} ORDER BY created_at DESC LIMIT 10
      `
      const chats = await prisma.$queryRaw`
        SELECT id, name, type FROM chat_rooms WHERE name LIKE ${like} LIMIT 10
      `
      const files = await prisma.$queryRaw`
        SELECT id, name, size, type, created_at FROM files WHERE name LIKE ${like} ORDER BY created_at DESC LIMIT 10
      `
      res.json({ success: true, data: toPlain({ tickets, employees, wiki, news, chats, files }) })
    } catch (fallbackErr) {
      logger.error('Search fallback also failed:', fallbackErr)
      res.status(500).json({ message: 'Search failed' })
    }
  }
})

export default router
