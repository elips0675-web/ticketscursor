// Серверный доступ к feature_flags: небольшая in-memory кэш-прослойка (TTL 30с),
// чтобы не дёргать БД на каждый запрос в middleware require2FA.
// Инвалидация вызывается из PUT /api/admin/features и в тестах перед сценариями с флагом.
import prisma from './prisma.js'

let cache = null
let cacheTime = 0
const TTL = 30_000

export async function isFeatureEnabled(key) {
  const now = Date.now()
  if (!cache || now - cacheTime > TTL) {
    cache = await prisma.feature_flags.findMany({ select: { key: true, enabled: true } })
    cacheTime = now
  }
  const flag = cache.find((f) => f.key === key)
  return flag ? flag.enabled : false
}

export function invalidateFeatureFlagCache() {
  cache = null
  cacheTime = 0
}