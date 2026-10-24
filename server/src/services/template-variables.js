const CANONICAL_VARIABLES = [
  'ticket.id',
  'ticket.title',
  'ticket.status',
  'ticket.priority',
  'ticket.category',
  'customer.name',
  'customer.email',
  'agent.name',
  'agent.email',
  'company.name',
]

const EMAIL_VARIABLES = [
  'ticketId',
  'ticketTitle',
  'ticketStatus',
  'priority',
  'status',
  'newStatus',
  'oldStatus',
  'oldPriority',
  'newPriority',
  'fromPriority',
  'toPriority',
  'dueAt',
  'level',
  'companyName',
  'userName',
  'senderName',
  'messageText',
]

export const TEMPLATE_VARIABLES = Object.freeze([...CANONICAL_VARIABLES, ...EMAIL_VARIABLES])

const ALLOWED = new Set(TEMPLATE_VARIABLES)

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g

export function buildTemplateContext({ ticket, customer, agent, company } = {}) {
  const context = {
    'ticket.id': ticket?.id ?? '',
    'ticket.title': ticket?.title ?? '',
    'ticket.status': ticket?.status ?? '',
    'ticket.priority': ticket?.priority ?? '',
    'ticket.category': ticket?.category ?? '',
    'customer.name': customer?.name ?? '',
    'customer.email': customer?.email ?? '',
    'agent.name': agent?.name ?? '',
    'agent.email': agent?.email ?? '',
    'company.name': company?.name ?? '',
  }

  context.ticketId = context['ticket.id']
  context.ticketTitle = context['ticket.title']
  context.ticketStatus = context['ticket.status']
  context.priority = context['ticket.priority']
  context.status = context['ticket.status']
  context.companyName = context['company.name']

  return context
}

export function resolveTemplateVariables(template, context = {}) {
  if (typeof template !== 'string') return ''
  if (!context || typeof context !== 'object') return template

  return template.replace(PLACEHOLDER, (match, key) => {
    if (!ALLOWED.has(key)) return match
    const value = context[key]
    return value === null || value === undefined ? '' : String(value)
  })
}
