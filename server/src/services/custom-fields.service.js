import prisma from '../prisma.js'

export async function listFieldDefinitions(category) {
  const where = { enabled: true }
  if (category) where.category = category
  return prisma.custom_field_definitions.findMany({
    where,
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  })
}

export async function listAllFieldDefinitions() {
  return prisma.custom_field_definitions.findMany({
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  })
}

export async function getFieldDefinition(id) {
  return prisma.custom_field_definitions.findUnique({ where: { id } })
}

export async function createFieldDefinition({ name, type, options, required, category, sortOrder }) {
  const allowedTypes = ['text', 'number', 'date', 'select', 'textarea', 'checkbox']
  if (!allowedTypes.includes(type)) {
    const err = new Error(`Invalid type: ${type}. Allowed: ${allowedTypes.join(', ')}`)
    err.statusCode = 400
    throw err
  }
  if (type === 'select' && (!options || !Array.isArray(options) || options.length === 0)) {
    const err = new Error('Select fields require at least one option')
    err.statusCode = 400
    throw err
  }
  return prisma.custom_field_definitions.create({
    data: {
      name,
      type,
      options: options || null,
      required: required || false,
      category: category || 'general',
      sort_order: sortOrder ?? 0,
    },
  })
}

export async function updateFieldDefinition(id, data) {
  const existing = await prisma.custom_field_definitions.findUnique({ where: { id } })
  if (!existing) return null
  const update = {}
  if (data.name !== undefined) update.name = data.name
  if (data.type !== undefined) {
    const allowedTypes = ['text', 'number', 'date', 'select', 'textarea', 'checkbox']
    if (!allowedTypes.includes(data.type)) {
      const err = new Error(`Invalid type: ${data.type}`)
      err.statusCode = 400
      throw err
    }
    update.type = data.type
  }
  if (data.options !== undefined) update.options = data.options
  if (data.required !== undefined) update.required = data.required
  if (data.category !== undefined) update.category = data.category
  if (data.sortOrder !== undefined) update.sort_order = data.sortOrder
  if (data.enabled !== undefined) update.enabled = data.enabled
  update.updated_at = new Date()
  return prisma.custom_field_definitions.update({ where: { id }, data: update })
}

export async function deleteFieldDefinition(id) {
  const existing = await prisma.custom_field_definitions.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.custom_field_definitions.delete({ where: { id } })
  return true
}

export async function getTicketCustomFields(ticketId) {
  const values = await prisma.custom_field_values.findMany({
    where: { ticket_id: ticketId },
    include: { field: true },
  })
  return values.map(v => ({
    fieldId: v.field_id,
    fieldName: v.field.name,
    fieldType: v.field.type,
    value: v.value,
  }))
}

export async function setTicketCustomFields(ticketId, fields) {
  if (!Array.isArray(fields)) return []
  const fieldIds = [...new Set(fields.map(f => f.fieldId).filter(Boolean))]
  if (fieldIds.length === 0) return []
  const defs = await prisma.custom_field_definitions.findMany({
    where: { id: { in: fieldIds } },
  })
  const defById = new Map(defs.map(d => [d.id, d]))
  const results = []
  for (const { fieldId, value } of fields) {
    const def = defById.get(fieldId)
    if (!def || !def.enabled) continue
    if (def.required && (!value || value.trim() === '')) {
      const err = new Error(`Field "${def.name}" is required`)
      err.statusCode = 400
      throw err
    }
    if (value && def.type === 'number' && isNaN(Number(value))) {
      const err = new Error(`Field "${def.name}" must be a number`)
      err.statusCode = 400
      throw err
    }
    if (def.type === 'select' && def.options && !def.options.includes(value)) {
      const err = new Error(`Field "${def.name}" must be one of: ${def.options.join(', ')}`)
      err.statusCode = 400
      throw err
    }
    const row = await prisma.custom_field_values.upsert({
      where: { field_id_ticket_id: { field_id: fieldId, ticket_id: ticketId } },
      update: { value: value || null, updated_at: new Date() },
      create: { field_id: fieldId, ticket_id: ticketId, value: value || null },
    })
    results.push(row)
  }
  return results
}
