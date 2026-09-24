import { cache } from '../cache.js'

const TTL = 86400
const CACHE_TIMEOUT_MS = 500

// In-memory дубль: idempotency работает даже при падении Redis (best-effort, per-instance).
const memStore = new Map()

function memGet(key) {
  const entry = memStore.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    memStore.delete(key)
    return null
  }
  return entry.value
}

function memSet(key, value) {
  memStore.set(key, { value, expiry: Date.now() + TTL * 1000 })
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cache timeout')), ms)
    promise.then(
      v => { clearTimeout(t); resolve(v) },
      e => { clearTimeout(t); reject(e) },
    )
  })
}

export function idempotent(req, res, next) {
  const key = req.headers['idempotency-key']
  if (!key) return next()

  const cacheKey = `idempotency:${req.user?.userId || 'anon'}:${key}`

  withTimeout(cache.get(cacheKey), CACHE_TIMEOUT_MS)
    .then(cached => {
      if (cached) return res.json(cached)
      const mem = memGet(cacheKey)
      if (mem) return res.json(mem)
      const originalJson = res.json.bind(res)
      res.json = (body) => {
        cache.set(cacheKey, body, TTL).catch(() => {})
        memSet(cacheKey, body)
        originalJson(body)
      }
      next()
    })
    .catch(() => {
      // Redis упал/недоступен — работаем по in-memory копии
      const mem = memGet(cacheKey)
      if (mem) return res.json(mem)
      const originalJson = res.json.bind(res)
      res.json = (body) => {
        memSet(cacheKey, body)
        originalJson(body)
      }
      next()
    })
}