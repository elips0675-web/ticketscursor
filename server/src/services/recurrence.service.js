import cronParser from 'cron-parser'
import prisma from '../prisma.js'
import logger from '../logger.js'

function parseCron(expr) {
  try {
    return cronParser.parseExpression(expr)
  } catch {
    return null
  }
}

export async function createRecurrence({ title, description, priority, category, assignedTo, cronExpr, createdBy }) {
  const next = parseCron(cronExpr)
  const nextRun = next ? next.next().toDate() : null

  return prisma.ticket_recurrences.create({
    data: {
      title,
      description: description || null,
      priority: priority || 'medium',
      category: category || 'support',
      assigned_to: assignedTo || null,
      cron_expr: cronExpr,
      next_run: nextRun,
      created_by: createdBy || null,
    },
  })
}

export async function updateRecurrence(id, data) {
  const existing = await prisma.ticket_recurrences.findFirst({ where: { id, deleted_at: null } })
  if (!existing) return null

  const update = {}
  if (data.title !== undefined) update.title = data.title
  if (data.description !== undefined) update.description = data.description
  if (data.priority !== undefined) update.priority = data.priority
  if (data.category !== undefined) update.category = data.category
  if (data.assigned_to !== undefined) update.assigned_to = data.assigned_to
  if (data.is_active !== undefined) update.is_active = data.is_active

  if (data.cron_expr !== undefined) {
    update.cron_expr = data.cron_expr
    const next = parseCron(data.cron_expr)
    update.next_run = next ? next.next().toDate() : null
  }

  return prisma.ticket_recurrences.update({ where: { id }, data: update })
}

export async function deleteRecurrence(id) {
  const existing = await prisma.ticket_recurrences.findFirst({ where: { id, deleted_at: null } })
  if (!existing) return null
  await prisma.ticket_recurrences.update({ where: { id }, data: { deleted_at: new Date() } })
  return true
}

export async function listRecurrences() {
  return prisma.ticket_recurrences.findMany({
    where: { deleted_at: null },
    include: {
      assigned_employee: { select: { id: true, name: true } },
      creator_employee: { select: { id: true, name: true } },
    },
    orderBy: { created_at: 'desc' },
  })
}

export async function getRecurrenceById(id) {
  return prisma.ticket_recurrences.findFirst({
    where: { id, deleted_at: null },
    include: {
      assigned_employee: { select: { id: true, name: true } },
      creator_employee: { select: { id: true, name: true } },
    },
  })
}

export async function processRecurrences() {
  const now = new Date()
  const due = await prisma.ticket_recurrences.findMany({
    where: {
      is_active: true,
      deleted_at: null,
      next_run: { lte: now },
    },
  })

  let created = 0
  for (const rec of due) {
    try {
      const ticket = await prisma.tickets.create({
        data: {
          title: `[Плановое] ${rec.title}`,
          description: rec.description || null,
          priority: rec.priority || 'medium',
          category: rec.category || 'support',
          assigned_to: rec.assigned_to,
          created_by: rec.created_by || 1,
        },
      })

      const next = parseCron(rec.cron_expr)
      const nextRun = next ? next.next().toDate() : null

      await prisma.ticket_recurrences.update({
        where: { id: rec.id },
        data: { last_run: now, next_run: nextRun },
      })

      logger.info(`Recurring ticket #${ticket.id} created from recurrence #${rec.id}: ${rec.title}`)
      created++
    } catch (err) {
      logger.error(`Failed to process recurrence #${rec.id}: ${err.message}`)
    }
  }

  return created
}
