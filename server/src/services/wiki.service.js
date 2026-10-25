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

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(value) {
  const source = String(value || '').toLowerCase()
  let transliterated = ''
  for (const char of source) {
    transliterated += Object.prototype.hasOwnProperty.call(TRANSLIT, char) ? TRANSLIT[char] : char
  }
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/g, '')
  return slug || 'article'
}

async function uniqueSlug(base, excludeId) {
  let candidate = base
  let suffix = 1
  for (;;) {
    const where = { slug: candidate }
    if (excludeId) where.NOT = { id: excludeId }
    const existing = await prisma.wiki_articles.findFirst({ where, select: { id: true } })
    if (!existing) return candidate
    suffix += 1
    const tail = `-${suffix}`
    candidate = `${base.slice(0, 200 - tail.length)}${tail}`
  }
}

export async function createArticle({ title, content, category, tags, userId, userName, published, slug }) {
  const finalSlug = await uniqueSlug(slug ? slugify(slug) : slugify(title))
  return prisma.wiki_articles.create({
    data: {
      title, content, category: category || 'Другое', tags: tags || [],
      author_id: userId, author_name: userName || 'User',
      slug: finalSlug,
      published: published === true,
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

export async function updateArticle({ id, title, content, category, tags, userId, userName, published, slug }) {
  const data = {
    title, content, category: category || 'Другое', tags: tags || [], updated_at: new Date(),
  }
  if (typeof published === 'boolean') data.published = published
  if (slug) data.slug = await uniqueSlug(slugify(slug), id)
  const article = await prisma.wiki_articles.update({ where: { id }, data })
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
