import prisma from '../prisma.js'

const STOP_WORDS = new Set([
  'как', 'что', 'когда', 'где', 'почему', 'зачем', 'который', 'которая', 'которые', 'которое',
  'этот', 'эта', 'это', 'эти', 'такой', 'такая', 'такое', 'такие', 'так', 'здесь', 'тут',
  'быть', 'был', 'была', 'было', 'были', 'будет', 'будут', 'есть',
  'для', 'при', 'через', 'после', 'перед', 'между', 'около', 'вроде',
  'все', 'всё', 'всех', 'всем', 'его', 'её', 'ее', 'их', 'меня', 'тебя', 'нас', 'вас',
  'можно', 'нельзя', 'нужно', 'надо', 'может', 'могут', 'должен', 'должна', 'должны',
  'очень', 'совсем', 'лучше', 'хорошо', 'плохо', 'пожалуйста', 'спасибо',
  'вопрос', 'вопросы', 'проблема', 'проблемы', 'работает', 'работать', 'сделать',
  'помощь', 'помогите', 'c', 'по', 'с', 'до', 'из', 'от', 'за', 'на', 'в', 'о', 'об',
  'и', 'или', 'не', 'ни', 'а', 'но', 'если', 'то', 'же', 'ли', 'б', 'бы',
  'a', 'an', 'the', 'to', 'for', 'of', 'with', 'in', 'on', 'at', 'by', 'from', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'how', 'what', 'when', 'where', 'why', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'one', 'two', 'help', 'need', 'please', 'can', 'could', 'will', 'would',
  'not', 'no', 'yes', 'but', 'and', 'or', 'if', 'then', 'there', 'here', 'it', 'its',
])

const LLM_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

export function extractKeywords(text) {
  if (!text) return []
  const words = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  return [...new Set(words)].slice(0, 12)
}

export function rankArticles(articles, keywords) {
  return articles
    .map((a) => {
      const haystack = `${a.title} ${a.content || ''} ${(a.tags || []).join(' ')}`.toLowerCase()
      const score = keywords.reduce((sum, kw) => (haystack.includes(kw) ? sum + 1 : sum), 0)
      return { article: a, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
}

function snippet(text, max = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).trimEnd()}...`
}

export async function searchWiki(keywords, limit = 5) {
  if (!keywords.length) return []
  const where = { OR: [] }
  for (const kw of keywords) {
    where.OR.push(
      { title: { contains: kw } },
      { content: { contains: kw } },
      { tags: { array_contains: kw } },
    )
  }
  const rows = await prisma.wiki_articles.findMany({ where, take: 30 })
  return rankArticles(rows, keywords).slice(0, limit).map((x) => x.article)
}

export function buildAnswer(keywords, articles) {
  if (!keywords.length) {
    return 'Не удалось выделить ключевые слова из обращения. Уточните, пожалуйста, суть проблемы, ' +
      'и подберите статью из базы знаний вручную.'
  }
  if (!articles.length) {
    return `По запросу «${keywords.join(', ')}» подходящих статей в базе знаний не найдено. ` +
      'Рекомендуем уточнить формулировку или вручную поискать в разделе Wiki.'
  }
  const list = articles
    .map((a, i) => `${i + 1}. «${a.title}» — ${snippet(a.content)}`)
    .join('\n')
  const titles = articles.map((a) => `«${a.title}»`).join(', ')
  return `Найдены следующие материалы из базы знаний:\n\n${list}\n\n` +
    `Рекомендации:\n• Ознакомьтесь со статьями: ${titles}.\n` +
    '• Если ни одна из них не решает проблему, создайте заявку вручную или уточните детали.'
}

async function generateLlmAnswer({ ticket, messages, articles }) {
  const context = [
    ticket.title,
    ticket.description || '',
    ...messages.map((m) => m.text),
  ].filter(Boolean).join('\n').slice(0, 4000)
  const wiki = articles
    .map((a) => `${a.title}\n${a.content}`)
    .join('\n\n---\n\n')
    .slice(0, 12000)
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: 'Ты — ассистент службы поддержки. Отвечай на русском, кратко, по делу. Используй только материалы из базы знаний. Если данных недостаточно, честно скажи об этом.' },
      { role: 'user', content: `Обращение пользователя:\n${context}\n\nБаза знаний (Wiki):\n${wiki}\n\nДай решение проблемы на основе базы знаний.` },
    ],
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = await response.json()
    const answer = data?.choices?.[0]?.message?.content?.trim()
    return answer || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function generateAssistantSuggestion({ ticket, messages, useLlm = true, limit = 5, keywordLimit = 12 }) {
  const text = [
    ticket.title,
    ticket.description || '',
    ...messages.map((m) => m.text),
  ].join(' ')
  const keywords = extractKeywords(text).slice(0, keywordLimit)
  const articles = await searchWiki(keywords, limit)
  let answer = null
  if (useLlm && process.env.OPENAI_API_KEY) {
    answer = await generateLlmAnswer({ ticket, messages, articles })
  }
  const templateAnswer = buildAnswer(keywords, articles)
  return {
    keywords,
    answer: answer || templateAnswer,
    usedLlm: Boolean(answer),
    sources: articles.map((a) => ({ id: a.id, title: a.title, category: a.category || null })),
  }
}