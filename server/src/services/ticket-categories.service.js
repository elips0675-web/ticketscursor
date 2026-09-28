// Этап 66 (подфича 3): Ticket forms — категории тикетов с JSON-схемой полей.
// Категория хранит schema: [{ name, label, type, required, options }].
// Валидация значений формы происходит в validateTicketForm().
import prisma from '../prisma.js'

const ALLOWED_TYPES = ['text', 'number', 'date', 'select', 'textarea', 'checkbox']

export async function listCategories({ enabledOnly = false } = {}) {
  const where = {}
  if (enabledOnly) where.enabled = true
  return prisma.ticket_categories.findMany({
    where,
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  })
}

export async function getCategory(id) {
  if (!Number.isFinite(Number(id))) return null
  return prisma.ticket_categories.findUnique({ where: { id: Number(id) } })
}

export async function getCategoryByName(name) {
  if (!name) return null
  return prisma.ticket_categories.findUnique({ where: { name: String(name) } })
}

function normalizeSchema(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((f) => ({
      name: String(f?.name || '').trim(),
      label: String(f?.label || f?.name || '').trim(),
      type: ALLOWED_TYPES.includes(f?.type) ? f.type : 'text',
      required: Boolean(f?.required),
      options: Array.isArray(f?.options) ? f.options.map(String) : [],
    }))
    .filter((f) => f.name && f.label)
}

export async function createCategory({ name, description, schema, enabled, sortOrder }) {
  if (!name || !String(name).trim()) {
    const err = new Error('Category name is required')
    err.statusCode = 400
    throw err
  }
  const existing = await prisma.ticket_categories.findUnique({ where: { name: String(name).trim() } })
  if (existing) {
    const err = new Error(`Категория «${name}» уже существует`)
    err.statusCode = 409
    throw err
  }
  return prisma.ticket_categories.create({
    data: {
      name: String(name).trim(),
      description: description || '',
      schema: normalizeSchema(schema),
      enabled: enabled ?? true,
      sort_order: sortOrder ?? 0,
    },
  })
}

export async function updateCategory(id, data) {
  const existing = await getCategory(id)
  if (!existing) return null
  const update = {}
  if (data.name !== undefined) {
    if (!String(data.name).trim()) {
      const err = new Error('Category name is required')
      err.statusCode = 400
      throw err
    }
    update.name = String(data.name).trim()
  }
  if (data.description !== undefined) update.description = data.description
  if (data.schema !== undefined) update.schema = normalizeSchema(data.schema)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.sortOrder !== undefined) update.sort_order = data.sortOrder
  update.updated_at = new Date()
  return prisma.ticket_categories.update({ where: { id: Number(id) }, data: update })
}

export async function deleteCategory(id) {
  const existing = await getCategory(id)
  if (!existing) return false
  await prisma.ticket_categories.delete({ where: { id: Number(id) } })
  return true
}

// Валидация значений формы по JSON-схеме категории.
// values: Record<fieldName, string>. Возвращает { ok, error? } — отклоняет при отсутствии
// обязательных полей или неверных значениях select.
export function validateTicketForm(category, values) {
  if (!category?.schema || !Array.isArray(category.schema) || category.schema.length === 0) {
    return { ok: true }
  }
  for (const field of category.schema) {
    const value = values?.[field.name]
    const isEmpty = value === undefined || value === null || String(value).trim() === ''
    if (field.required && isEmpty) {
      return { ok: false, error: `Поле «${field.label}» обязательно` }
    }
    if (!isEmpty && field.type === 'number' && Number.isNaN(Number(value))) {
      return { ok: false, error: `Поле «${field.label}» должно быть числом` }
    }
    if (!isEmpty && field.type === 'select' && !field.options.includes(String(value))) {
      return { ok: false, error: `Поле «${field.label}» должно быть одним из: ${field.options.join(', ')}` }
    }
  }
  return { ok: true }
}