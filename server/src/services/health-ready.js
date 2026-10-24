import prisma from '../prisma.js'
import { checkRedis } from './admin-ops.js'
import { clamavStatus } from '../clamav.js'

export async function buildReadiness() {
  const timestamp = new Date().toISOString()
  const clamav = clamavStatus()

  try {
    await prisma.$queryRawUnsafe('SELECT 1')
  } catch {
    return {
      status: 503,
      body: {
        status: 'error',
        db: false,
        redis: false,
        queue: { mode: 'unknown', ok: false },
        clamav,
        degraded: true,
        timestamp,
      },
    }
  }

  const redis = await checkRedis().catch(() => ({ ok: false, configured: false }))
  const queue = redis.configured
    ? { mode: 'bullmq', ok: Boolean(redis.ok) }
    : { mode: 'in-memory', ok: true }
  const degraded = !redis.ok || !queue.ok || !clamav.ok

  return {
    status: 200,
    body: {
      status: degraded ? 'degraded' : 'ok',
      db: true,
      redis: Boolean(redis.ok),
      queue,
      clamav,
      degraded,
      timestamp,
    },
  }
}
