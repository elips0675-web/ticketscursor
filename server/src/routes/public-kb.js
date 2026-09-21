import { Router } from 'express'
import prisma from '../prisma.js'
import logger from '../logger.js'

const router = Router()

router.get('/articles', async (req, res) => {
  try {
    const { q, category, page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = { published: true, deleted_at: null }
    if (category) where.category = category
    if (q) where.OR = [
      { title: { contains: String(q) } },
      { content: { contains: String(q) } },
    ]

    const [articles, total] = await Promise.all([
      prisma.wiki_articles.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
        select: {
          id: true, title: true, slug: true, content: true, category: true,
          created_at: true, updated_at: true,
        },
      }),
      prisma.wiki_articles.count({ where }),
    ])

    const mapped = articles.map(a => ({
      ...a,
      excerpt: a.content ? a.content.slice(0, 200).replace(/[#*_`]/g, '') : '',
    }))

    res.json({
      success: true,
      data: mapped,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    })
  } catch (err) {
    logger.error('Public KB list error:', err)
    res.status(500).json({ success: false, message: 'Failed to list articles' })
  }
})

router.get('/articles/:slug', async (req, res) => {
  try {
    const article = await prisma.wiki_articles.findFirst({
      where: { slug: req.params.slug, published: true, deleted_at: null },
    })
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' })

    let votes = { up: 0, down: 0 }
    try {
      const voteData = await prisma.$queryRaw`SELECT vote_type, COUNT(*) as cnt FROM article_votes WHERE article_id = ${article.id} GROUP BY vote_type`
      for (const v of voteData) {
        votes[v.vote_type === 'up' ? 'up' : 'down'] = Number(v.cnt)
      }
    } catch {
      // votes table may not exist yet
    }

    let similar = []
    if (article.content) {
      const words = article.content.split(/\s+/).filter((w) => w.length > 4).slice(0, 5)
      if (words.length > 0) {
        const searchCondition = words.map((w) => ({ content: { contains: w } }))
        similar = await prisma.wiki_articles.findMany({
          where: { published: true, deleted_at: null, id: { not: article.id }, OR: searchCondition },
          take: 3,
          select: { id: true, title: true, slug: true, category: true },
        })
      }
    }

    res.json({
      success: true,
      data: { ...article, votes, similar },
    })
  } catch (err) {
    logger.error('Public KB article error:', err)
    res.status(500).json({ success: false, message: 'Failed to get article' })
  }
})

router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.wiki_articles.findMany({
      where: { published: true, deleted_at: null },
      distinct: ['category'],
      select: { category: true },
    })
    res.json({
      success: true,
      data: categories.map(c => c.category).filter(Boolean),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get categories' })
  }
})

router.post('/articles/:id/vote', async (req, res) => {
  try {
    const articleId = Number(req.params.id)
    const { vote } = req.body
    if (!['up', 'down'].includes(vote)) return res.status(400).json({ success: false, message: 'Vote must be up or down' })

    const ip = req.ip || req.connection?.remoteAddress || 'unknown'

    try {
      await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS article_votes (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, article_id INT UNSIGNED NOT NULL, vote_type VARCHAR(10) NOT NULL, ip_address VARCHAR(45), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
      await prisma.$executeRaw`INSERT INTO article_votes (article_id, vote_type, ip_address) VALUES (${articleId}, ${vote}, ${ip})`
    } catch {
      // fallback if table creation fails
    }

    res.json({ success: true })
  } catch (err) {
    logger.error('Public KB vote error:', err)
    res.status(500).json({ success: false, message: 'Failed to vote' })
  }
})

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.json({ success: true, data: [] })

    const articles = await prisma.wiki_articles.findMany({
      where: {
        published: true,
        deleted_at: null,
        OR: [
          { title: { contains: String(q) } },
          { content: { contains: String(q) } },
        ],
      },
      take: 10,
      select: { id: true, title: true, slug: true, category: true, content: true },
    })

    const results = articles.map(a => ({
      ...a,
      excerpt: a.content ? a.content.slice(0, 150).replace(/[#*_`]/g, '') : '',
    }))

    res.json({ success: true, data: results })
  } catch (err) {
    logger.error('Public KB search error:', err)
    res.status(500).json({ success: false, message: 'Search failed' })
  }
})

export default router
