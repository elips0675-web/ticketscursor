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
    const key = req.params.slug
    const where = { published: true, deleted_at: null }
    if (/^\d+$/.test(key)) where.id = Number(key)
    else where.slug = key

    const article = await prisma.wiki_articles.findFirst({ where })
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' })

    let votes = { up: 0, down: 0 }
    try {
      const voteData = await prisma.$queryRaw`SELECT vote_type, COUNT(*) as cnt FROM article_votes WHERE article_id = ${article.id} GROUP BY vote_type`
      for (const v of voteData) {
        votes[v.vote_type === 'up' ? 'up' : 'down'] = Number(v.cnt)
      }
    } catch (voteErr) {
      logger.warn('Public KB votes read failed:', voteErr.message)
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

    const article = await prisma.wiki_articles.findFirst({
      where: { id: articleId, published: true, deleted_at: null },
      select: { id: true },
    })
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' })

    const ip = req.ip || req.connection?.remoteAddress || 'unknown'
    await prisma.$executeRaw`INSERT INTO article_votes (article_id, vote_type, ip_address) VALUES (${articleId}, ${vote}, ${ip})`

    const voteData = await prisma.$queryRaw`SELECT vote_type, COUNT(*) as cnt FROM article_votes WHERE article_id = ${articleId} GROUP BY vote_type`
    const votes = { up: 0, down: 0 }
    for (const v of voteData) votes[v.vote_type === 'up' ? 'up' : 'down'] = Number(v.cnt)

    res.json({ success: true, data: votes })
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
