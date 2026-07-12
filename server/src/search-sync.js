import { Meilisearch } from 'meilisearch'
import prisma from './prisma.js'
import logger from './logger.js'

const MEILI_URL = process.env.MEILISEARCH_URL || 'http://localhost:7700'
const MEILI_KEY = process.env.MEILI_MASTER_KEY || 'meilisearch-master-key'

let client = null
let _syncing = false
const _pendingSyncs = []

function getClient() {
  if (!client && MEILI_URL) {
    try {
      client = new Meilisearch({ host: MEILI_URL, apiKey: MEILI_KEY })
    } catch {
      logger.warn('Meilisearch not available, using FULLTEXT fallback')
    }
  }
  return client
}

async function flushPending() {
  const batch = _pendingSyncs.splice(0)
  for (const { entity, action, data } of batch) {
    try {
      if (action === 'upsert') {
        await client.index(entity).addDocuments([data])
      } else if (action === 'delete') {
        await client.index(entity).deleteDocument(data.id)
      }
    } catch (err) {
      logger.warn(`Meilisearch flush ${entity}/${action} failed:`, err.message)
    }
  }
}

const INDEXES = {
  tickets: { primaryKey: 'id', fields: ['title', 'description', 'status', 'priority', 'category'] },
  employees: { primaryKey: 'id', fields: ['name', 'email', 'department'] },
  wiki: { primaryKey: 'id', fields: ['title', 'content', 'category'] },
  news: { primaryKey: 'id', fields: ['title', 'content'] },
  chats: { primaryKey: 'id', fields: ['name'] },
  files: { primaryKey: 'id', fields: ['name'] },
}

async function setupIndexes() {
  const c = getClient()
  if (!c) return false
  try {
    for (const [name, config] of Object.entries(INDEXES)) {
      const index = c.index(name)
      try {
        await index.updateFilterableAttributes(config.fields)
        await index.updateSearchableAttributes(config.fields)
      } catch {
        await index.updateSettings({
          searchableAttributes: config.fields,
          filterableAttributes: config.fields,
        })
      }
    }
    logger.info('Meilisearch indexes configured')
    return true
  } catch (err) {
    logger.warn('Meilisearch setup failed:', err.message)
    return false
  }
}

async function fullSync() {
  const c = getClient()
  if (!c) return
  if (_syncing) {
    logger.warn('Meilisearch fullSync already in progress, skipping')
    return
  }
  _syncing = true
  try {
    const tickets = await prisma.tickets.findMany({ select: { id: true, title: true, description: true, status: true, priority: true, category: true } })
    if (tickets.length) await c.index('tickets').addDocuments(tickets.map(t => ({ ...t, description: t.description || '' })))

    const employees = await prisma.employees.findMany({ select: { id: true, name: true, email: true, department: true } })
    if (employees.length) await c.index('employees').addDocuments(employees)

    const wiki = await prisma.wiki_articles.findMany({ select: { id: true, title: true, content: true, category: true } })
    if (wiki.length) await c.index('wiki').addDocuments(wiki.map(w => ({ ...w, content: w.content || '' })))

    const news = await prisma.news_posts.findMany({ select: { id: true, title: true, content: true } })
    if (news.length) await c.index('news').addDocuments(news.map(n => ({ ...n, content: n.content || '' })))

    const chats = await prisma.chat_rooms.findMany({ select: { id: true, name: true } })
    if (chats.length) await c.index('chats').addDocuments(chats)

    const files = await prisma.files.findMany({ select: { id: true, name: true } })
    if (files.length) await c.index('files').addDocuments(files)

    logger.info(`Meilisearch full sync complete: ${tickets.length} tickets, ${employees.length} employees, ${wiki.length} wiki, ${news.length} news, ${chats.length} chats, ${files.length} files`)
  } catch (err) {
    logger.error('Meilisearch full sync failed:', err.message)
  } finally {
    _syncing = false
    if (_pendingSyncs.length > 0) {
      logger.info(`Flushing ${_pendingSyncs.length} pending syncs after fullSync`)
      await flushPending()
    }
  }
}

async function syncEntity(entity, action, data) {
  const c = getClient()
  if (!c || !INDEXES[entity]) return
  if (_syncing) {
    _pendingSyncs.push({ entity, action, data })
    return
  }
  try {
    if (action === 'upsert') {
      await c.index(entity).addDocuments([data])
    } else if (action === 'delete') {
      await c.index(entity).deleteDocument(data.id)
    }
  } catch (err) {
    logger.warn(`Meilisearch sync ${entity}/${action} failed:`, err.message)
  }
}

export async function searchMeilisearch(query, limit = 10) {
  const c = getClient()
  if (!c) return null
  try {
    const results = {}
    for (const name of Object.keys(INDEXES)) {
      const r = await c.index(name).search(query, { limit })
      results[name] = r.hits.map(({ _formatted: _, ...rest }) => rest)
    }
    return results
  } catch (err) {
    logger.warn('Meilisearch query failed:', err.message)
    return null
  }
}

export async function initSearchSync() {
  const c = getClient()
  if (!c) {
    logger.info('Meilisearch not configured, using FULLTEXT search')
    return
  }
  const ok = await setupIndexes()
  if (ok) {
    await fullSync()
    logger.info('Meilisearch ready')
  }
}

export { syncEntity }
