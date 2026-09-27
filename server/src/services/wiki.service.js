import prisma from '../prisma.js'

export async function listArticles(page, limit) {
  const offset = (page - 1) * limit
  const total = await prisma.wiki_articles.count()
  const rows = await prisma.wiki_articles.findMany({
    orderBy: { updated_at: 'desc' }, skip: offset, take: limit,
  })
  return { data: rows, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getArticleById(id) {
  return prisma.wiki_articles.findUnique({ where: { id } })
}

export async function createArticle({ title, content, category, tags, userId, userName }) {
  return prisma.wiki_articles.create({
    data: {
      title, content, category: category || 'Другое', tags: tags || [],
      author_id: userId, author_name: userName || 'User',
    },
  })
}

async function getNextRevision(articleId) {
  const last = await prisma.wiki_revisions.findFirst({
    where: { article_id: articleId },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  })
  return (last?.revision || 0) + 1
}

export async function createRevision({ articleId, authorId, authorName, title, content, category, tags }) {
  const revision = await getNextRevision(articleId)
  return prisma.wiki_revisions.create({
    data: {
      article_id: articleId, revision,
      title, content, category: category || 'Другое', tags: tags || [],
      author_id: authorId || null, author_name: authorName || 'User',
    },
  })
}

export async function updateArticle({ id, title, content, category, tags, userId, userName }) {
  const article = await prisma.wiki_articles.update({
    where: { id },
    data: { title, content, category: category || 'Другое', tags: tags || [], updated_at: new Date() },
  })
  await createRevision({ articleId: id, authorId: userId, authorName: userName, title, content, category, tags })
  return article
}

export async function listRevisions(articleId) {
  return prisma.wiki_revisions.findMany({
    where: { article_id: articleId },
    orderBy: { revision: 'desc' },
  })
}

export async function getRevision(id, articleId) {
  return prisma.wiki_revisions.findFirst({ where: { id, article_id: articleId } })
}

export async function rollbackArticle({ id, revisionId, userId, userName }) {
  const rev = await prisma.wiki_revisions.findFirst({ where: { id: revisionId, article_id: id } })
  if (!rev) return null
  const article = await prisma.wiki_articles.update({
    where: { id },
    data: { title: rev.title, content: rev.content, category: rev.category || 'Другое', tags: rev.tags || [], updated_at: new Date() },
  })
  const revision = await createRevision({
    articleId: id, authorId: userId, authorName: userName,
    title: rev.title, content: rev.content, category: rev.category, tags: rev.tags,
  })
  return { article, revision }
}
