// Rich messages (CHW-08): блоки card/input/select/chips.
// payload хранится в ticket_messages/chat_messages/widget_messages.rich_payload,
// content_type = 'rich_json'. Схема — единственный источник правды: и API,
// и клиент рендерят только то, что прошло валидацию.
import { z } from 'zod'

export const MAX_RICH_BLOCKS = 10
export const MAX_RICH_OPTIONS = 10

const labelSchema = z.string().trim().min(1, 'Label required').max(200)
const fieldNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,40}$/, 'Field name must be snake_case')

const optionSchema = z.object({
  label: labelSchema,
  value: z.string().trim().min(1, 'Option value required').max(200),
})

const actionSchema = z
  .object({
    type: z.enum(['link', 'postback']),
    label: z.string().trim().min(1, 'Action label required').max(80),
    url: z.string().trim().max(500).optional(),
    value: z.string().trim().max(200).optional(),
  })
  .superRefine((action, ctx) => {
    if (action.type === 'link' && !action.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'url required for link action' })
    }
    if (action.type === 'postback' && !action.value) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'value required for postback action' })
    }
  })

export const richBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('card'),
    title: z.string().trim().min(1, 'Card title required').max(200),
    subtitle: z.string().trim().max(200).optional(),
    text: z.string().trim().max(2000).optional(),
    image_url: z.string().trim().max(500).optional(),
    actions: z.array(actionSchema).max(3).optional(),
  }),
  z.object({
    type: z.literal('input'),
    name: fieldNameSchema,
    label: labelSchema,
    placeholder: z.string().trim().max(200).optional(),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('select'),
    name: fieldNameSchema,
    label: labelSchema,
    options: z.array(optionSchema).min(1, 'At least one option required').max(MAX_RICH_OPTIONS),
    multiple: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('chips'),
    options: z.array(optionSchema).min(1, 'At least one option required').max(MAX_RICH_OPTIONS),
  }),
])

export const richPayloadSchema = z.object({
  blocks: z.array(richBlockSchema).min(1, 'At least one block required').max(MAX_RICH_BLOCKS),
})

export function parseRichPayload(value) {
  if (value === undefined || value === null) return { ok: true, payload: null }
  const result = richPayloadSchema.safeParse(value)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }
  return { ok: true, payload: result.data }
}

export function resolveRichPayload(value, enabled) {
  const parsed = parseRichPayload(value)
  if (!parsed.ok) return { error: 'INVALID_RICH_PAYLOAD', errors: parsed.errors }
  if (parsed.payload && !enabled) return { error: 'RICH_MESSAGES_DISABLED' }
  return { payload: parsed.payload }
}

export function richMessageData(payload) {
  return payload ? { content_type: 'rich_json', rich_payload: payload } : { content_type: 'text', rich_payload: null }
}
