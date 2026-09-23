import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  custom_field_definitions: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(d => Promise.resolve({ id: 1, ...d.data, created_at: new Date(), updated_at: new Date() })),
    update: vi.fn().mockImplementation(d => Promise.resolve({ id: 1, ...d.data })),
    delete: vi.fn().mockResolvedValue({}),
  },
  custom_field_values: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockImplementation(d => Promise.resolve({ id: 1, ...d })),
  },
}))

vi.mock('../../prisma.js', () => ({ default: prismaMock }))
vi.mock('../../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('custom-fields.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listFieldDefinitions', () => {
    it('returns all definitions', async () => {
      prismaMock.custom_field_definitions.findMany.mockResolvedValue([
        { id: 1, name: 'Department', type: 'select', options: ['IT', 'HR'] },
      ])
      const { listFieldDefinitions } = await import('../custom-fields.service.js')
      const fields = await listFieldDefinitions()
      expect(fields).toHaveLength(1)
      expect(fields[0].name).toBe('Department')
    })

    it('filters by category', async () => {
      const { listFieldDefinitions } = await import('../custom-fields.service.js')
      await listFieldDefinitions('support')
      expect(prismaMock.custom_field_definitions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ category: 'support' }) })
      )
    })
  })

  describe('createFieldDefinition', () => {
    it('creates a text field', async () => {
      const { createFieldDefinition } = await import('../custom-fields.service.js')
      const field = await createFieldDefinition({ name: 'Asset Tag', type: 'text' })
      expect(field.name).toBe('Asset Tag')
      expect(field.type).toBe('text')
    })

    it('creates a select field with options', async () => {
      const { createFieldDefinition } = await import('../custom-fields.service.js')
      const field = await createFieldDefinition({ name: 'Priority Reason', type: 'select', options: ['Bug', 'Feature', 'Other'] })
      expect(field.options).toEqual(['Bug', 'Feature', 'Other'])
    })

    it('rejects invalid type', async () => {
      const { createFieldDefinition } = await import('../custom-fields.service.js')
      await expect(createFieldDefinition({ name: 'Test', type: 'invalid' }))
        .rejects.toThrow('Invalid type')
    })

    it('rejects select without options', async () => {
      const { createFieldDefinition } = await import('../custom-fields.service.js')
      await expect(createFieldDefinition({ name: 'Test', type: 'select', options: [] }))
        .rejects.toThrow('Select fields require at least one option')
    })
  })

  describe('updateFieldDefinition', () => {
    it('updates an existing field', async () => {
      prismaMock.custom_field_definitions.findUnique.mockResolvedValue({ id: 1, name: 'Old' })
      const { updateFieldDefinition } = await import('../custom-fields.service.js')
      const result = await updateFieldDefinition(1, { name: 'New' })
      expect(result).toBeTruthy()
    })

    it('returns null for nonexistent field', async () => {
      prismaMock.custom_field_definitions.findUnique.mockResolvedValue(null)
      const { updateFieldDefinition } = await import('../custom-fields.service.js')
      const result = await updateFieldDefinition(999, { name: 'X' })
      expect(result).toBeNull()
    })
  })

  describe('deleteFieldDefinition', () => {
    it('deletes an existing field', async () => {
      prismaMock.custom_field_definitions.findUnique.mockResolvedValue({ id: 1 })
      const { deleteFieldDefinition } = await import('../custom-fields.service.js')
      const result = await deleteFieldDefinition(1)
      expect(result).toBe(true)
    })

    it('returns false for nonexistent field', async () => {
      prismaMock.custom_field_definitions.findUnique.mockResolvedValue(null)
      const { deleteFieldDefinition } = await import('../custom-fields.service.js')
      const result = await deleteFieldDefinition(999)
      expect(result).toBe(false)
    })
  })

  describe('setTicketCustomFields', () => {
    it('upserts field values', async () => {
      prismaMock.custom_field_definitions.findMany.mockResolvedValue([
        { id: 1, name: 'Asset', type: 'text', enabled: true, required: false, options: null },
      ])
      prismaMock.custom_field_values.upsert.mockResolvedValue({ id: 1, field_id: 1, ticket_id: 10, value: 'ABC-123' })

      const { setTicketCustomFields } = await import('../custom-fields.service.js')
      const results = await setTicketCustomFields(10, [{ fieldId: 1, value: 'ABC-123' }])
      expect(results).toHaveLength(1)
      expect(prismaMock.custom_field_values.upsert).toHaveBeenCalled()
      expect(prismaMock.custom_field_definitions.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
      })
    })

    it('skips disabled fields', async () => {
      prismaMock.custom_field_definitions.findMany.mockResolvedValue([
        { id: 1, name: 'Disabled', type: 'text', enabled: false },
      ])

      const { setTicketCustomFields } = await import('../custom-fields.service.js')
      const results = await setTicketCustomFields(10, [{ fieldId: 1, value: 'X' }])
      expect(results).toHaveLength(0)
    })

    it('rejects required field with empty value', async () => {
      prismaMock.custom_field_definitions.findMany.mockResolvedValue([
        { id: 1, name: 'Required', type: 'text', enabled: true, required: true, options: null },
      ])

      const { setTicketCustomFields } = await import('../custom-fields.service.js')
      await expect(setTicketCustomFields(10, [{ fieldId: 1, value: '' }]))
        .rejects.toThrow('is required')
    })

    it('rejects non-numeric value for number field', async () => {
      prismaMock.custom_field_definitions.findMany.mockResolvedValue([
        { id: 1, name: 'Count', type: 'number', enabled: true, required: false, options: null },
      ])

      const { setTicketCustomFields } = await import('../custom-fields.service.js')
      await expect(setTicketCustomFields(10, [{ fieldId: 1, value: 'abc' }]))
        .rejects.toThrow('must be a number')
    })

    it('rejects invalid select option', async () => {
      prismaMock.custom_field_definitions.findMany.mockResolvedValue([
        { id: 1, name: 'Category', type: 'select', enabled: true, required: false, options: ['A', 'B'] },
      ])

      const { setTicketCustomFields } = await import('../custom-fields.service.js')
      await expect(setTicketCustomFields(10, [{ fieldId: 1, value: 'C' }]))
        .rejects.toThrow('must be one of')
    })

    it('handles empty fields array', async () => {
      const { setTicketCustomFields } = await import('../custom-fields.service.js')
      const results = await setTicketCustomFields(10, [])
      expect(results).toEqual([])
      expect(prismaMock.custom_field_definitions.findMany).not.toHaveBeenCalled()
    })
  })

  describe('getTicketCustomFields', () => {
    it('returns mapped custom fields', async () => {
      prismaMock.custom_field_values.findMany.mockResolvedValue([
        { field_id: 1, value: 'ABC', field: { id: 1, name: 'Asset', type: 'text' } },
      ])

      const { getTicketCustomFields } = await import('../custom-fields.service.js')
      const fields = await getTicketCustomFields(10)
      expect(fields).toHaveLength(1)
      expect(fields[0].fieldName).toBe('Asset')
      expect(fields[0].value).toBe('ABC')
    })
  })
})
