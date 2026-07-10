import { randomUUID } from 'crypto'
import prisma from '../prisma.js'
import { getSettings } from '../settings.js'

function parseBooleanSetting(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function getSlaHours(priority, settings) {
  const raw = Number(settings.SLA_RESPONSE_HOURS)
  const base = Number.isFinite(raw) && raw > 0 ? raw : 4
  switch (priority) {
    case 'critical':
      return Math.max(1, Math.round(base * 0.5))
    case 'high':
      return base
    case 'low':
      return base * 4
    case 'medium':
    default:
      return base * 2
  }
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
            where: { status: { in: ['open', 'in_progress'] } },
          },
        },
      },
    },
    orderBy: { assigned_tickets: { _count: 'asc' } },
    take: 1,
  })
  return rows?.[0]?.id || null
}

export async function listTickets({ page, limit }) {
  const offset = (page - 1) * limit
  const total = await prisma.tickets.count()
  const rows = await prisma.tickets.findMany({
    skip: offset,
    take: limit,
    orderBy: { updated_at: 'desc' },
    include: {
      assigned_to_employee: {
        select: { name: true, email: true, avatar: true },
      },
      _count: {
        select: { ticket_messages: true },
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
    },
    orderBy: { due_at: 'asc' },
    take: limit,
    include: {
      assigned_to_employee: { select: { name: true, email: true, avatar: true } },
    },
  })
  return rows.map(mapTicketRow)
}

export async function getTicketById(id, messagePage = 1, messageLimit = 50) {
  const ticket = await prisma.tickets.findUnique({
    where: { id },
    include: {
      assigned_to_employee: {
        select: { name: true, email: true, avatar: true },
      },
      ticket_messages: {
        orderBy: { created_at: 'asc' },
        take: messageLimit,
        skip: (messagePage - 1) * messageLimit,
      },
    },
  })
  if (!ticket) return null
  return mapTicketRow(ticket)
}

export async function getTicketMessages(id, page = 1, limit = 50) {
  const offset = (page - 1) * limit
  const [rows, total] = await Promise.all([
    prisma.ticket_messages.findMany({
      where: { ticket_id: id },
      orderBy: { created_at: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.ticket_messages.count({ where: { ticket_id: id } }),
  ])
  return { data: rows, total, page, totalPages: Math.ceil(total / limit) }
}

export async function createTicket({ title, description, priority, category, createdBy }) {
  const settings = await getSettings().catch(() => ({}))
  const normalizedPriority = priority || 'medium'
  const dueAt = new Date(Date.now() + getSlaHours(normalizedPriority, settings) * 60 * 60 * 1000)
  const autoAssignEnabled = parseBooleanSetting(settings.AUTO_ASSIGN)
  const autoAssignedTo = autoAssignEnabled ? await getLeastLoadedAssignee() : null
  const ticket = await prisma.tickets.create({
    data: {
      title,
      description,
      status: 'open',
      priority: normalizedPriority,
      category: category || 'support',
      created_by: createdBy,
      assigned_to: autoAssignedTo,
      due_at: dueAt,
    },
  })
  return { ticket, dueAt, autoAssignedTo }
}

export async function updateTicketStatus(id, status) {
  const old = await prisma.tickets.findUnique({
    where: { id },
    select: { status: true, first_response_at: true, resolved_at: true },
  })
  if (!old) return null
  const updateData = {
    status,
    updated_at: new Date(),
    resolved_at: getResolvedAt(status, old.resolved_at),
  }
  if (status === 'in_progress' && !old.first_response_at) {
    updateData.first_response_at = new Date()
  }
  await prisma.tickets.update({ where: { id }, data: updateData })
  return old
}

export async function updateTicketPriority(id, priority) {
  const old = await prisma.tickets.findUnique({
    where: { id },
    select: { priority: true },
  })
  if (!old) return null
  await prisma.tickets.update({ where: { id }, data: { priority, updated_at: new Date() } })
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
