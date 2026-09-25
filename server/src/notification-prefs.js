// Этап 63 (подфича 3): настройки уведомлений per user.
// Каналы (email/push/in_app) × события тикетов; дефолт — все включены (обратная совместимость).
// Кэш преференсов 30с (как feature-flags.js), инвалидация на PUT /notifications/preferences.
import prisma from './prisma.js'

export const NOTIF_EVENTS = [
  'ticket_created',
  'ticket_status',
  'ticket_priority',
  'ticket_assigned',
  'ticket_message',
  'ticket_mention',
  'ticket_sla_overdue',
  'ticket_sla_escalated',
]

export const NOTIF_CHANNELS = ['email', 'push', 'in_app']

/** Полный дефолт: все события × все каналы включены. */
export function defaultPrefs() {
  return Object.fromEntries(NOTIF_EVENTS.map((ev) => [ev, Object.fromEntries(NOTIF_CHANNELS.map((ch) => [ch, true]))]))
}

/**
 * Нормализация payload из PUT /notifications/preferences.
 * Возвращает { valid, prefs?, error? } — отбрасывает неизвестные события/каналы,
 * приводит значения к boolean.
 */
export function normalizePrefs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Preferences must be an object' }
  }
  const prefs = defaultPrefs()
  for (const ev of NOTIF_EVENTS) {
    const row = input[ev]
    if (row === undefined) continue
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { valid: false, error: `Event "${ev}" must be an object` }
    }
    for (const ch of NOTIF_CHANNELS) {
      if (row[ch] === undefined) continue
      if (typeof row[ch] !== 'boolean') {
        return { valid: false, error: `Channel "${ch}" of "${ev}" must be boolean` }
      }
      prefs[ev][ch] = row[ch]
    }
  }
  return { valid: true, prefs }
}

/** Слияние сохранённого (возможно частичного) объекта с дефолтами. */
export function mergePrefs(stored) {
  const base = defaultPrefs()
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return base
  for (const ev of NOTIF_EVENTS) {
    const row = stored[ev]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    for (const ch of NOTIF_CHANNELS) {
      if (typeof row[ch] === 'boolean') base[ev][ch] = row[ch]
    }
  }
  return base
}

const PREFS_CACHE_TTL = 30_000
const prefsCache = new Map() // userId -> { prefs, time }

export function invalidateNotificationPrefsCache(userId) {
  if (userId !== undefined) prefsCache.delete(userId)
}

async function fetchStoredPrefs(userId) {
  try {
    const row = await prisma.notification_preferences.findUnique({
      where: { user_id: userId },
      select: { prefs: true },
    })
    if (!row?.prefs) return null
    return JSON.parse(row.prefs)
  } catch {
    return null
  }
}

export async function getPrefsForUser(userId) {
  if (userId == null) return defaultPrefs()
  const hit = prefsCache.get(userId)
  if (hit && Date.now() - hit.time < PREFS_CACHE_TTL) return hit.prefs
  const stored = await fetchStoredPrefs(userId)
  const prefs = mergePrefs(stored)
  prefsCache.set(userId, { prefs, time: Date.now() })
  return prefs
}

export async function isChannelEnabled(userId, eventType, channel) {
  const prefs = await getPrefsForUser(userId)
  return prefs[eventType]?.[channel] !== false
}

/** Возвращает подмножество userIds, у которых канал включён для события (дефолт — все включены). */
export async function allowedUserIds(userIds, eventType, channel) {
  const uniq = [...new Set((userIds || []).filter((id) => id != null))]
  if (uniq.length === 0) return uniq
  const results = await Promise.all(
    uniq.map(async (id) => ({ id, allowed: await isChannelEnabled(id, eventType, channel) })),
  )
  return results.filter((r) => r.allowed).map((r) => r.id)
}