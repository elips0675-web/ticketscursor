let cache

function createMemoryCache() {
  const store = new Map()
  cache = {
    async get(key) {
      const entry = store.get(key)
      if (!entry) return null
      if (Date.now() > entry.expiry) { store.delete(key); return null }
      return entry.value
    },
    async set(key, value, ttl = 300) {
      store.set(key, { value, expiry: Date.now() + ttl * 1000 })
    },
    async invalidate(pattern) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      for (const key of store.keys()) {
        if (regex.test(key)) store.delete(key)
      }
    },
  }
  console.log('Cache using in-memory store')
}

// Initialize in-memory cache synchronously so it's never undefined
createMemoryCache()

// Upgrade to Redis if available (async)
if (process.env.REDIS_URL) {
  ;(async () => {
    try {
      const { default: Redis } = await import('ioredis')
      const client = new Redis(process.env.REDIS_URL)
      const delScript = `
        local cursor = '0'
        local count = 0
        repeat
          local result = redis.call('scan', cursor, 'match', KEYS[1], 'count', 1000)
          cursor = result[1]
          local keys = result[2]
          if #keys > 0 then
            redis.call('del', unpack(keys))
            count = count + #keys
          end
        until cursor == '0'
        return count
      `
      cache = {
        async get(key) {
          const val = await client.get(key)
          return val ? JSON.parse(val) : null
        },
        async set(key, value, ttl = 300) {
          await client.set(key, JSON.stringify(value), 'EX', ttl)
        },
        async invalidate(pattern) {
          await client.eval(delScript, 1, pattern)
        },
      }
      console.log('Cache using Redis')
    } catch (err) {
      console.warn('Redis cache unavailable, using in-memory:', err.message)
    }
  })()
}

export function cacheMiddleware(ttl = 300) {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next()
    const token = (req.headers.authorization || '').slice(0, 20)
    const key = `cache:${token}:${req.originalUrl}`
    const cached = await cache.get(key)
    if (cached) return res.json(cached)
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      cache.set(key, body, ttl)
      originalJson(body)
    }
    next()
  }
}

export async function invalidateCache(pattern) {
  if (cache) await cache.invalidate(pattern)
}
