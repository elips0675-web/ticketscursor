import { describe, it, expect } from 'vitest'
import {
  MAX_RICH_BLOCKS,
  parseRichPayload,
  resolveRichPayload,
  richBlockSchema,
  richMessageData,
} from '../rich-messages.js'

const CARD = {
  type: 'card',
  title: 'Счёт готов',
  subtitle: 'Октябрь',
  text: 'Скачайте счёт и оплатите до 5 ноября.',
  actions: [
    { type: 'link', label: 'Открыть', url: 'https://example.com/invoice/1' },
    { type: 'postback', label: 'Напомнить', value: 'remind' },
  ],
}

describe('rich-messages — Zod-схема блоков (CHW-08)', () => {
  describe('принимает каждый тип блока', () => {
    it('card со ссылкой и postback-кнопкой', () => {
      const result = richBlockSchema.safeParse(CARD)
      expect(result.success).toBe(true)
    })

    it('input', () => {
      const result = richBlockSchema.safeParse({
        type: 'input',
        name: 'order_id',
        label: 'Номер заказа',
        placeholder: 'A-123',
        required: true,
      })
      expect(result.success).toBe(true)
    })

    it('select', () => {
      const result = richBlockSchema.safeParse({
        type: 'select',
        name: 'plan',
        label: 'Тариф',
        multiple: false,
        options: [
          { label: 'Базовый', value: 'basic' },
          { label: 'Про', value: 'pro' },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('chips', () => {
      const result = richBlockSchema.safeParse({
        type: 'chips',
        options: [
          { label: 'Да', value: 'yes' },
          { label: 'Нет', value: 'no' },
        ],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('отбивает невалидные блоки', () => {
    it('неизвестный тип блока', () => {
      const result = richBlockSchema.safeParse({ type: 'video', url: 'https://example.com/a.mp4' })
      expect(result.success).toBe(false)
    })

    it('card без заголовка', () => {
      const result = richBlockSchema.safeParse({ type: 'card', text: 'без заголовка' })
      expect(result.success).toBe(false)
    })

    it('ссылка без url', () => {
      const result = richBlockSchema.safeParse({
        type: 'card',
        title: 'Карточка',
        actions: [{ type: 'link', label: 'Открыть' }],
      })
      expect(result.success).toBe(false)
    })

    it('postback без value', () => {
      const result = richBlockSchema.safeParse({
        type: 'card',
        title: 'Карточка',
        actions: [{ type: 'postback', label: 'Напомнить' }],
      })
      expect(result.success).toBe(false)
    })

    it('select без вариантов', () => {
      const result = richBlockSchema.safeParse({ type: 'select', name: 'plan', label: 'Тариф', options: [] })
      expect(result.success).toBe(false)
    })

    it('имя поля не в snake_case', () => {
      const result = richBlockSchema.safeParse({ type: 'input', name: 'Order-Id', label: 'Номер' })
      expect(result.success).toBe(false)
    })
  })

  describe('parseRichPayload', () => {
    it('null и undefined — это отсутствие payload, а не ошибка', () => {
      expect(parseRichPayload(null)).toEqual({ ok: true, payload: null })
      expect(parseRichPayload(undefined)).toEqual({ ok: true, payload: null })
    })

    it('принимает payload из нескольких блоков', () => {
      const parsed = parseRichPayload({
        blocks: [CARD, { type: 'chips', options: [{ label: 'Да', value: 'yes' }] }],
      })
      expect(parsed.ok).toBe(true)
      expect(parsed.payload.blocks).toHaveLength(2)
    })

    it('пустой список блоков — ошибка', () => {
      const parsed = parseRichPayload({ blocks: [] })
      expect(parsed.ok).toBe(false)
      expect(parsed.errors[0].field).toBe('blocks')
    })

    it(`больше ${MAX_RICH_BLOCKS} блоков — ошибка`, () => {
      const blocks = Array.from({ length: MAX_RICH_BLOCKS + 1 }, () => CARD)
      expect(parseRichPayload({ blocks }).ok).toBe(false)
    })

    it('не-объект — ошибка', () => {
      expect(parseRichPayload('card').ok).toBe(false)
      expect(parseRichPayload(42).ok).toBe(false)
    })
  })

  describe('resolveRichPayload — kill switch rich_messages', () => {
    const payload = { blocks: [CARD] }

    it('флаг включён — payload проходит', () => {
      const result = resolveRichPayload(payload, true)
      expect(result.error).toBeUndefined()
      expect(result.payload.blocks).toHaveLength(1)
    })

    it('флаг выключен — RICH_MESSAGES_DISABLED', () => {
      expect(resolveRichPayload(payload, false)).toEqual({ error: 'RICH_MESSAGES_DISABLED' })
    })

    it('без payload флаг не мешает обычному тексту', () => {
      expect(resolveRichPayload(undefined, false)).toEqual({ payload: null })
    })

    it('невалидный payload важнее выключенного флага', () => {
      const result = resolveRichPayload({ blocks: [{ type: 'nope' }] }, false)
      expect(result.error).toBe('INVALID_RICH_PAYLOAD')
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('richMessageData', () => {
    it('с payload — rich_json и объект', () => {
      const payload = { blocks: [CARD] }
      expect(richMessageData(payload)).toEqual({ content_type: 'rich_json', rich_payload: payload })
    })

    it('без payload — text и null', () => {
      expect(richMessageData(null)).toEqual({ content_type: 'text', rich_payload: null })
      expect(richMessageData(undefined)).toEqual({ content_type: 'text', rich_payload: null })
    })
  })
})
