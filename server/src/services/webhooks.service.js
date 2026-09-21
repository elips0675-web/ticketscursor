import crypto from 'crypto'
import prisma from '../prisma.js'
import logger from '../logger.js'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

export const AVAILABLE_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.message',
  'ticket.assigned',
  'ticket.closed',
  'employee.created',
  'employee.updated',
]

export async function createWebhook({ name, url, secret, events, createdBy }) {
  return prisma.webhooks.create({
    data: {
      name,
      url,
      secret: secret || null,
      events: Array.isArray(events) ? events.join(',') : events,
      created_by: createdBy || null,
    },
  })
}

export async function updateWebhook(id, data) {
  const existing = await prisma.webhooks.findFirst({ where: { id, deleted_at: null } })
  if (!existing) return null

  const update = {}
  if (data.name !== undefined) update.name = data.name
  if (data.url !== undefined) update.url = data.url
  if (data.secret !== undefined) update.secret = data.secret || null
  if (data.events !== undefined) update.events = Array.isArray(data.events) ? data.events.join(',') : data.events
  if (data.is_active !== undefined) update.is_active = data.is_active

  return prisma.webhooks.update({ where: { id }, data: update })
}

export async function deleteWebhook(id) {
  const existing = await prisma.webhooks.findFirst({ where: { id, deleted_at: null } })
  if (!existing) return null
  await prisma.webhooks.update({ where: { id }, data: { deleted_at: new Date() } })
  return true
}

export async function listWebhooks() {
  return prisma.webhooks.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: 'desc' },
  })
}

export async function triggerWebhooks(eventType, payload) {
  const hooks = await prisma.webhooks.findMany({
    where: { is_active: true, deleted_at: null },
  })

  for (const hook of hooks) {
    const events = hook.events.split(',').map(e => e.trim())
    if (!events.includes(eventType)) continue

    deliverWebhook(hook, eventType, payload)
  }
}

async function deliverWebhook(hook, eventType, payload, attempt = 1) {
  const body = JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() })

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': eventType,
    'X-Webhook-Id': String(hook.id),
    'User-Agent': 'ServiceDesk-Webhook/1.0',
  }

  if (hook.secret) {
    const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex')
    headers['X-Webhook-Signature'] = `sha256=${signature}`
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    await prisma.webhooks.update({
      where: { id: hook.id },
      data: {
        last_status: res.status,
        last_error: res.ok ? null : `HTTP ${res.status}`,
        last_triggered_at: new Date(),
      },
    }).catch(() => {})

    if (!res.ok && attempt < MAX_RETRIES) {
      setTimeout(() => deliverWebhook(hook, eventType, payload, attempt + 1), RETRY_DELAY_MS * attempt)
    }
  } catch (err) {
    logger.error(`Webhook #${hook.id} delivery failed (attempt ${attempt}): ${err.message}`)

    await prisma.webhooks.update({
      where: { id: hook.id },
      data: {
        last_status: 0,
        last_error: err.message,
        last_triggered_at: new Date(),
      },
    }).catch(() => {})

    if (attempt < MAX_RETRIES) {
      setTimeout(() => deliverWebhook(hook, eventType, payload, attempt + 1), RETRY_DELAY_MS * attempt)
    }
  }
}
