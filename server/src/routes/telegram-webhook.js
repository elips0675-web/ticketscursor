import { Router } from 'express'
import crypto from 'node:crypto'
import prisma from '../prisma.js'
import logger from '../logger.js'
import { telegramUpdateSchema } from '../schemas.js'
import { handleTelegramUpdate } from '../telegram.js'

const router = Router()

const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

function secretMatches(received, expected) {
  if (!received || !expected) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

router.post('/', async (req, res) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) {
    return res.status(503).json({ ok: false, message: 'Telegram webhook is not configured' })
  }
  if (!secretMatches(req.get(SECRET_HEADER), expected)) {
    return res.status(401).json({ ok: false, message: 'Invalid secret token' })
  }

  const parsed = telegramUpdateSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Invalid update' })
  }

  const update = parsed.data
  const kind = update.message ? 'message' : 'callback_query'

  try {
    await prisma.telegram_updates.create({
      data: { update_id: BigInt(update.update_id), kind },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.json({ ok: true, duplicate: true })
    }
    logger.error('Telegram webhook dedup error:', err)
    return res.status(500).json({ ok: false })
  }

  try {
    await handleTelegramUpdate(update)
  } catch (err) {
    logger.error('Telegram webhook handling error:', err)
  }

  res.json({ ok: true })
})

export default router
