import prisma from '../prisma.js'
import logger from '../logger.js'

export const AVAILABLE_TRIGGERS = [
  'ticket.created',
  'ticket.updated',
  'ticket.message',
  'ticket.assigned',
  'ticket.closed',
]

export const AVAILABLE_ACTIONS = [
  'set_priority',
  'set_status',
  'assign_to',
  'add_tag',
  'send_notification',
]

function evaluateCondition(condition, data) {
  const { field, operator, value } = condition
  const fieldValue = data[field]

  switch (operator) {
    case 'equals':
      return String(fieldValue) === String(value)
    case 'not_equals':
      return String(fieldValue) !== String(value)
    case 'contains':
      return String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase())
    case 'gt':
      return Number(fieldValue) > Number(value)
    case 'lt':
      return Number(fieldValue) < Number(value)
    case 'in':
      return Array.isArray(value) && value.includes(String(fieldValue))
    case 'not_in':
      return Array.isArray(value) && !value.includes(String(fieldValue))
    case 'is_empty':
      return !fieldValue || fieldValue === '' || fieldValue === null
    case 'is_not_empty':
      return fieldValue && fieldValue !== '' && fieldValue !== null
    default:
      return false
  }
}

function evaluateConditions(conditions, data) {
  if (!conditions || conditions.length === 0) return true

  const { logic = 'and', rules = [] } = conditions
  const results = rules.map(rule => evaluateCondition(rule, data))

  if (logic === 'or') return results.some(Boolean)
  return results.every(Boolean)
}

async function executeAction(action, data, ticketId) {
  const { type, params } = action

  switch (type) {
    case 'set_priority':
      if (params?.priority) {
        await prisma.tickets.update({
          where: { id: ticketId },
          data: { priority: params.priority },
        })
        logger.info(`Rule action: set priority to ${params.priority} for ticket #${ticketId}`)
      }
      break

    case 'set_status':
      if (params?.status) {
        await prisma.tickets.update({
          where: { id: ticketId },
          data: { status: params.status },
        })
        logger.info(`Rule action: set status to ${params.status} for ticket #${ticketId}`)
      }
      break

    case 'assign_to':
      if (params?.employeeId) {
        await prisma.tickets.update({
          where: { id: ticketId },
          data: { assigned_to: params.employeeId },
        })
        logger.info(`Rule action: assigned ticket #${ticketId} to employee #${params.employeeId}`)
      }
      break

    case 'add_tag':
      if (params?.tag) {
        const ticket = await prisma.tickets.findUnique({ where: { id: ticketId }, select: { tags: true } })
        const existingTags = ticket?.tags ? (typeof ticket.tags === 'string' ? JSON.parse(ticket.tags) : ticket.tags) : []
        if (!existingTags.includes(params.tag)) {
          existingTags.push(params.tag)
          await prisma.tickets.update({
            where: { id: ticketId },
            data: { tags: JSON.stringify(existingTags) },
          })
          logger.info(`Rule action: added tag "${params.tag}" to ticket #${ticketId}`)
        }
      }
      break

    case 'send_notification':
      if (params?.message && data.userId) {
        await prisma.notifications.create({
          data: {
            user_id: data.userId,
            title: 'Automation Rule',
            message: params.message.replace('{{ticketId}}', String(ticketId)),
            type: 'automation',
            link: `/tickets/${ticketId}`,
          },
        })
        logger.info(`Rule action: notification sent for ticket #${ticketId}`)
      }
      break

    default:
      logger.warn(`Unknown rule action type: ${type}`)
  }
}

export async function evaluateRules(eventType, data) {
  const rules = await prisma.automation_rules.findMany({
    where: {
      is_active: true,
      trigger_event: eventType,
      deleted_at: null,
    },
  })

  let executed = 0
  for (const rule of rules) {
    try {
      const conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions
      const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions

      if (!evaluateConditions(conditions, data)) continue

      for (const action of (actions || [])) {
        await executeAction(action, data, data.ticketId || data.id)
      }

      await prisma.automation_rules.update({
        where: { id: rule.id },
        data: { last_run: new Date(), run_count: { increment: 1 } },
      })

      executed++
    } catch (err) {
      logger.error(`Rule #${rule.id} execution failed: ${err.message}`)
    }
  }

  return executed
}

export async function createRule({ name, triggerEvent, conditions, actions, createdBy }) {
  return prisma.automation_rules.create({
    data: {
      name,
      trigger_event: triggerEvent,
      conditions: conditions || { logic: 'and', rules: [] },
      actions: actions || [],
      created_by: createdBy || null,
    },
  })
}

export async function updateRule(id, data) {
  const existing = await prisma.automation_rules.findFirst({ where: { id, deleted_at: null } })
  if (!existing) return null

  const update = {}
  if (data.name !== undefined) update.name = data.name
  if (data.trigger_event !== undefined) update.trigger_event = data.trigger_event
  if (data.conditions !== undefined) update.conditions = data.conditions
  if (data.actions !== undefined) update.actions = data.actions
  if (data.is_active !== undefined) update.is_active = data.is_active

  return prisma.automation_rules.update({ where: { id }, data: update })
}

export async function deleteRule(id) {
  const existing = await prisma.automation_rules.findFirst({ where: { id, deleted_at: null } })
  if (!existing) return null
  await prisma.automation_rules.update({ where: { id }, data: { deleted_at: new Date() } })
  return true
}

export async function listRules() {
  return prisma.automation_rules.findMany({
    where: { deleted_at: null },
    include: {
      creator_employee: { select: { id: true, name: true } },
    },
    orderBy: { created_at: 'desc' },
  })
}
