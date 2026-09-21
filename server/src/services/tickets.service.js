import { randomUUID } from 'crypto'
import prisma from '../prisma.js'
import { getSettings } from '../settings.js'
import { addBusinessHours, getRemainingBusinessMs } from '../sla.js'
import { setTicketCustomFields } from './custom-fields.service.js'

function parseBooleanSetting(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function getSlaHours(priority, category, settings) {
  const raw = Number(settings.SLA_RESPONSE_HOURS)
  const base = Number.isFinite(raw) && raw > 0 ? raw : 4
  const categoryMult = { incident: 0.5, bug: 0.75, support: 1, feature: 2, other: 1 }[category] || 1
  const priorityMult = { critical: 0.5, high: 1, medium: 2, low: 4 }[priority] || 2
  return Math.max(1, Math.round(base * categoryMult * priorityMult))
}

const VALID_TRANSITIONS = {
  open: ['open', 'in_progress', 'closed', 'waiting_for_customer'],
  in_progress: ['in_progress', 'resolved', 'closed', 'waiting_for_customer'],
  resolved: ['resolved', 'closed', 'reopened'],
  closed: ['closed', 'reopened'],
  reopened: ['reopened', 'in_progress', 'closed', 'waiting_for_customer'],
  waiting_for_customer: ['waiting_for_customer', 'in_progress', 'closed', 'reopened'],
}

function getResolvedAt(status, currentResolvedAt) {
  if (status === 'resolved' || status === 'closed') return new Date()
  if (status === 'reopened') return null
  return currentResolvedAt || null
}

function mapTicketRow(r) {
  const { assigned_to_employee, ticket_messages, ...rest } = r
  return {
    ...rest,
    assigned_name: assigned_to_employee?.name || null,
    assigned_email: assigned_to_employee?.email || null,
    assigned_avatar: assigned_to_employee?.avatar || null,
    messages: ticket_messages,
  }
}

export async function getLeastLoadedAssignee() {
  const rows = await prisma.employees.findMany({
    where: {
      is_active: true,
      role: { in: ['agent', 'senior_agent'] },
    },
    include: {
      _count: {
        select: {
          assigned_tickets: {
            where: { status: { in: ['open', 'in_progress'] }, deleted_at: null },
          },
        },
      },
    },
    orderBy: { assigned_tickets: { _count: 'asc' } },
    take: 1,
  })
  return rows?.[0]?.id || null
}

export async function listTickets({ page, limit, userId, role, tags }) {
  const where = { deleted_at: null }
  if (role === 'requester') {
    where.created_by = userId
  } else if (role === 'agent') {
    where.OR = [
      { assigned_to: userId },
      { assigned_to: null },
    ]
  }
  if (Array.isArray(tags) && tags.length > 0) {
    where.tags = { array_contains: tags[0] }
  }
  const offset = (page - 1) * limit
  const total = await prisma.tickets.count({ where })
  const rows = await prisma.tickets.findMany({
    where,
    skip: offset,
    take: limit,
    orderBy: { updated_at: 'desc' },
    include: {
      assigned_to_employee: {
        select: { name: true, email: true, avatar: true },
      },
      _count: {
        select: { ticket_messages: { where: { deleted_at: null } } },
      },
    },
  })
  const data = rows.map((r) => {
    const { assigned_to_employee, _count, ...rest } = r
    return {
      ...rest,
      assigned_name: assigned_to_employee?.name || null,
      assigned_email: assigned_to_employee?.email || null,
      assigned_avatar: assigned_to_employee?.avatar || null,
      messages: [],
      messages_count: _count.ticket_messages,
    }
  })
  return { data, total, page, totalPages: Math.ceil(total / limit) }
}

export async function listOverdueSlaTickets(limit) {
  const rows = await prisma.tickets.findMany({
    where: {
      status: { in: ['open', 'in_progress'] },
      due_at: { lt: new Date() },
      deleted_at: null,
      sla_paused_at: null,
    },
    orderBy: { due_at: 'asc' },
    take: limit,
    include: {
      assigned_to_employee: { select: { name: true, email: true, avatar: true } },
    },
  })
  return rows.map(mapTicketRow)
}

export async function getSlaStats() {
  const now = new Date()
  const baseWhere = { deleted_at: null }
  const total = await prisma.tickets.count({ where: { ...baseWhere, status: { in: ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed'] } } })
  const overdue = await prisma.tickets.count({ where: { ...baseWhere, status: { in: ['open', 'in_progress'] }, due_at: { lt: now, not: null }, sla_paused_at: null } })
  const onTime = await prisma.tickets.count({ where: { ...baseWhere, status: { in: ['resolved', 'closed'] }, due_at: { gte: now } } })
  const paused = await prisma.tickets.count({ where: { ...baseWhere, status: 'waiting_for_customer', sla_paused_at: { not: null } } })
  const noSla = await prisma.tickets.count({ where: { ...baseWhere, due_at: null } })
  return { total, overdue, onTime, paused, noSla }
}

export async function getTicketById(id, messagePage = 1, messageLimit = 50) {
  const [ticket, timeAgg, customFields] = await Promise.all([
    prisma.tickets.findUnique({
      where: { id },
      include: {
        assigned_to_employee: {
          select: { name: true, email: true, avatar: true },
        },
        ticket_messages: {
          where: { deleted_at: null },
          orderBy: { created_at: 'asc' },
          take: messageLimit,
          skip: (messagePage - 1) * messageLimit,
        },
      },
    }),
    prisma.time_entries.aggregate({
      where: { ticket_id: id },
      _sum: { minutes: true },
    }),
    prisma.custom_field_values.findMany({
      where: { ticket_id: id },
      include: { field: { select: { id: true, name: true, type: true } } },
    }),
  ])
  if (!ticket) return null
  const mapped = mapTicketRow(ticket)
  mapped.custom_fields = customFields.map(cf => ({
    fieldId: cf.field_id,
    fieldName: cf.field.name,
    fieldType: cf.field.type,
    value: cf.value,
  }))
  mapped.time_spent_minutes = timeAgg._sum.minutes || 0
  return mapped
}

export async function getTicketMessages(id, page = 1, limit = 50) {
  const offset = (page - 1) * limit
  const [rows, total] = await Promise.all([
    prisma.ticket_messages.findMany({
      where: { ticket_id: id, deleted_at: null },
      orderBy: { created_at: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.ticket_messages.count({ where: { ticket_id: id, deleted_at: null } }),
  ])
  return { data: rows, total, page, totalPages: Math.ceil(total / limit) }
}

export async function createTicket({ title, description, priority, category, createdBy, tags, customFields }) {
  const settings = await getSettings().catch(() => ({}))
  const normalizedPriority = priority || 'medium'
  const slaHours = getSlaHours(normalizedPriority, category, settings)
  const dueAt = addBusinessHours(new Date(), slaHours, settings)
  const autoAssignEnabled = parseBooleanSetting(settings.AUTO_ASSIGN)
  const autoAssignedTo = autoAssignEnabled ? await getLeastLoadedAssignee() : null
  const data = {
    title,
    description,
    status: 'open',
    priority: normalizedPriority,
    category: category || 'support',
    created_by: createdBy,
    assigned_to: autoAssignedTo,
    due_at: dueAt,
  }
  if (tags && tags.length > 0) data.tags = tags
  const ticket = await prisma.tickets.create({ data })
  if (customFields && customFields.length > 0) {
    await setTicketCustomFields(ticket.id, customFields).catch(() => {})
  }
  return { ticket, dueAt, autoAssignedTo }
}

export async function updateTicketTags(id, tags) {
  const old = await prisma.tickets.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!old) return null
  await prisma.tickets.update({
    where: { id },
    data: { tags: tags.length > 0 ? tags : [], updated_at: new Date() },
  })
  return { id, tags }
}

export async function bulkUpdateTickets({ ids, action, status, employeeId, priority }) {
  const where = { id: { in: ids }, deleted_at: null }
  const rows = await prisma.tickets.findMany({
    where,
    select: { id: true, status: true, priority: true, category: true, resolved_at: true, first_response_at: true },
  })
  if (rows.length === 0) return { updated: 0, skipped: ids.length, results: [] }

  let results = []
  if (action === 'status') {
    const now = new Date()
    const settings = await getSettings().catch(() => ({}))
    for (const row of rows) {
      const transitions = VALID_TRANSITIONS[row.status]
      if (!transitions || !transitions.includes(status)) {
        continue
      }
      const updateData = {
        status,
        updated_at: now,
        resolved_at: getResolvedAt(status, row.resolved_at),
      }
      if (status === 'in_progress' && !row.first_response_at) {
        updateData.first_response_at = now
      }
      await prisma.tickets.update({ where: { id: row.id }, data: updateData })
      results.push({ id: row.id, status })
    }
    return { updated: results.length, skipped: ids.length - results.length, results }
  }

  if (action === 'priority') {
    const settings = await getSettings().catch(() => ({}))
    const now = new Date()
    for (const row of rows) {
      const slaHours = getSlaHours(priority, row.category, settings)
      const dueAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000)
      await prisma.tickets.update({
        where: { id: row.id },
        data: { priority, due_at: dueAt, updated_at: now },
      })
      results.push({ id: row.id, priority })
    }
    return { updated: results.length, skipped: ids.length - results.length, results }
  }

  if (action === 'assign') {
    if (employeeId) {
      const emp = await prisma.employees.findUnique({ where: { id: employeeId }, select: { id: true } })
      if (!emp) {
        const err = new Error('Employee not found')
        err.statusCode = 404
        throw err
      }
    }
    const now = new Date()
    for (const row of rows) {
      await prisma.tickets.update({ where: { id: row.id }, data: { assigned_to: employeeId || null, updated_at: now } })
      results.push({ id: row.id, assigned_to: employeeId || null })
    }
    return { updated: results.length, skipped: ids.length - results.length, results }
  }

  return { updated: 0, skipped: ids.length, results: [] }
}

export async function updateTicketStatus(id, status) {
  const old = await prisma.tickets.findUnique({
    where: { id },
    select: { status: true, first_response_at: true, resolved_at: true, sla_paused_at: true, sla_accumulated_ms: true, due_at: true, created_at: true, priority: true, category: true },
  })
  if (!old) return null
  const allowed = VALID_TRANSITIONS[old.status]
  if (!allowed || !allowed.includes(status)) {
    const err = new Error(`Invalid status transition: ${old.status} → ${status}`)
    err.statusCode = 400
    throw err
  }
  const settings = await getSettings().catch(() => ({}))
  const now = new Date()
  const updateData = {
    status,
    updated_at: now,
    resolved_at: getResolvedAt(status, old.resolved_at),
  }

  if (status === 'in_progress' && !old.first_response_at) {
    updateData.first_response_at = now
  }

  if (status === 'waiting_for_customer' && !old.sla_paused_at) {
    updateData.sla_paused_at = now
  }

  if (old.status === 'waiting_for_customer' && old.sla_paused_at && status !== 'waiting_for_customer') {
    const pausedDuration = now.getTime() - old.sla_paused_at.getTime()
    updateData.sla_accumulated_ms = old.sla_accumulated_ms + pausedDuration
    updateData.sla_paused_at = null

    const elapsedMs = now.getTime() - old.created_at.getTime()
    const totalAccumulated = updateData.sla_accumulated_ms
    const activeMs = elapsedMs - totalAccumulated
    const slaHours = getSlaHours(old.priority, old.category, settings)
    const slaMs = slaHours * 60 * 60 * 1000
    const remainingMs = Math.max(0, slaMs - activeMs)
    updateData.due_at = addBusinessHours(now, remainingMs / (60 * 60 * 1000), settings)
  }

  await prisma.tickets.update({ where: { id }, data: updateData })
  return old
}

export async function updateTicketPriority(id, priority) {
  const old = await prisma.tickets.findUnique({
    where: { id },
    select: { priority: true, category: true, sla_paused_at: true, sla_accumulated_ms: true, created_at: true },
  })
  if (!old) return null
  const settings = await getSettings().catch(() => ({}))
  const now = new Date()
  const slaHours = getSlaHours(priority, old.category, settings)

  if (old.sla_paused_at) {
    const pausedDuration = now.getTime() - old.sla_paused_at.getTime()
    const totalAccumulated = old.sla_accumulated_ms + pausedDuration
    const elapsedMs = now.getTime() - old.created_at.getTime()
    const activeMs = elapsedMs - totalAccumulated
    const remainingMs = Math.max(0, slaHours * 60 * 60 * 1000 - activeMs)
    const dueAt = addBusinessHours(now, remainingMs / (60 * 60 * 1000), settings)
    await prisma.tickets.update({ where: { id }, data: { priority, due_at: dueAt, sla_accumulated_ms: totalAccumulated, sla_paused_at: now, updated_at: now } })
  } else {
    const dueAt = addBusinessHours(now, slaHours, settings)
    await prisma.tickets.update({ where: { id }, data: { priority, due_at: dueAt, updated_at: now } })
  }
  return { oldPriority: old.priority, newPriority: priority }
}

export async function updateTicketAssignee(id, employeeId) {
  let emp = null
  if (employeeId) {
    emp = await prisma.employees.findUnique({ where: { id: employeeId }, select: { name: true } })
    if (!emp) return null
  }
  const old = await prisma.tickets.findUnique({
    where: { id },
    select: { assigned_to: true },
  })
  if (!old) return null
  await prisma.tickets.update({ where: { id }, data: { assigned_to: employeeId || null, updated_at: new Date() } })
  return { oldAssignee: old.assigned_to, newAssignee: employeeId || null, employeeName: emp?.name || null }
}

export function generateTicketFilename(originalName) {
  return randomUUID() + '-' + originalName
}

const MENTION_RE = /(?<![A-Za-zА-Яа-яЁё0-9])@([A-Za-zА-Яа-яЁё0-9._-]+)/g

export function extractMentionTokens(text) {
  if (!text) return []
  const tokens = new Set()
  for (const match of String(text).matchAll(MENTION_RE)) {
    const value = match[1].trim()
    if (value) tokens.add(value)
  }
  return Array.from(tokens)
}

export async function resolveMentionedEmployees(text, excludeUserId) {
  if (!text || typeof text !== 'string' || !text.includes('@')) return []
  const rows = await prisma.employees.findMany({
    where: {
      is_active: true,
      NOT: excludeUserId ? { id: excludeUserId } : undefined,
    },
    select: { id: true, name: true, email: true },
  })
  const lowerText = text.toLowerCase()
  const ids = []
  const seen = new Set()
  for (const row of rows) {
    if (row.id === excludeUserId) continue
    const namePattern = '@' + row.name.toLowerCase()
    const emailPattern = '@' + row.email.split('@')[0].toLowerCase()
    if (lowerText.includes(namePattern) || lowerText.includes(emailPattern)) {
      if (!seen.has(row.id)) {
        seen.add(row.id)
        ids.push(row.id)
      }
    }
  }
  return ids
}
