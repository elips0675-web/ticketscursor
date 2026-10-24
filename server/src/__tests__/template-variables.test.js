import { describe, it, expect } from 'vitest'
import {
  TEMPLATE_VARIABLES,
  buildTemplateContext,
  resolveTemplateVariables,
} from '../services/template-variables.js'

describe('template-variables (CHW-07)', () => {
  describe('resolveTemplateVariables', () => {
    it('подставляет канонические переменные тикета, клиента, агента и компании', () => {
      const context = buildTemplateContext({
        ticket: { id: 42, title: 'Не работает VPN', status: 'open', priority: 'high', category: 'network' },
        customer: { name: 'Иван Петров', email: 'ivan@example.com' },
        agent: { name: 'Мария', email: 'maria@example.com' },
        company: { name: 'Acme' },
      })

      const result = resolveTemplateVariables(
        'Тикет #{{ticket.id}} «{{ticket.title}}» ({{ticket.status}}/{{ticket.priority}}/{{ticket.category}}). ' +
          'Клиент: {{customer.name}} <{{customer.email}}>. Агент: {{agent.name}} <{{agent.email}}>. — {{company.name}}',
        context,
      )

      expect(result).toBe(
        'Тикет #42 «Не работает VPN» (open/high/network). ' +
          'Клиент: Иван Петров <ivan@example.com>. Агент: Мария <maria@example.com>. — Acme',
      )
    })

    it('поддерживает старые имена переменных (ticketId, ticketTitle, companyName)', () => {
      const context = buildTemplateContext({
        ticket: { id: 7, title: 'Сбой оплаты' },
        company: { name: 'Acme' },
      })

      expect(resolveTemplateVariables('#{{ticketId}} {{ticketTitle}} — {{companyName}}', context)).toBe(
        '#7 Сбой оплаты — Acme',
      )
    })

    it('оставляет неизвестную переменную как есть, а не стирает её', () => {
      const context = buildTemplateContext({ ticket: { id: 5 } })
      expect(resolveTemplateVariables('Привет, {{unknown.variable}}!', context)).toBe('Привет, {{unknown.variable}}!')
    })

    it('известная переменная без значения в контексте превращается в пустую строку', () => {
      expect(resolveTemplateVariables('A{{customer.name}}B', {})).toBe('AB')
    })

    it('допускает пробелы внутри фигурных скобок', () => {
      const context = buildTemplateContext({ ticket: { id: 9 } })
      expect(resolveTemplateVariables('{{ ticket.id }}', context)).toBe('9')
    })

    it('null и undefined превращаются в пустую строку', () => {
      const context = { 'ticket.id': null, 'ticket.title': undefined }
      expect(resolveTemplateVariables('{{ticket.id}}|{{ticket.title}}', context)).toBe('|')
    })

    it('не подставляет повторно значение, содержащее плейсхолдер', () => {
      const context = buildTemplateContext({ ticket: { id: 1, title: '{{company.name}}' }, company: { name: 'Acme' } })
      expect(resolveTemplateVariables('{{ticket.title}}', context)).toBe('{{company.name}}')
    })

    it('возвращает пустую строку для не-строкового шаблона', () => {
      expect(resolveTemplateVariables(null, {})).toBe('')
      expect(resolveTemplateVariables(undefined, {})).toBe('')
      expect(resolveTemplateVariables(42, {})).toBe('')
    })

    it('возвращает шаблон без изменений, если контекст не объект', () => {
      expect(resolveTemplateVariables('{{ticket.id}}', null)).toBe('{{ticket.id}}')
    })
  })

  describe('buildTemplateContext', () => {
    it('заполняет старые имена из канонических значений', () => {
      const context = buildTemplateContext({
        ticket: { id: 3, title: 'Тема', status: 'closed', priority: 'low', category: 'billing' },
        company: { name: 'Acme' },
      })

      expect(context).toMatchObject({
        ticketId: 3,
        ticketTitle: 'Тема',
        ticketStatus: 'closed',
        priority: 'low',
        status: 'closed',
        companyName: 'Acme',
      })
    })

    it('без аргументов отдаёт пустые строки вместо undefined', () => {
      const context = buildTemplateContext()
      for (const key of TEMPLATE_VARIABLES) {
        if (key in context) expect(context[key]).toBe('')
      }
      expect(context['ticket.id']).toBe('')
      expect(context.ticketId).toBe('')
    })

    it('не падает на частично заполненном объекте', () => {
      const context = buildTemplateContext({ ticket: { id: 11 } })
      expect(context['ticket.id']).toBe(11)
      expect(context['customer.name']).toBe('')
      expect(context['agent.email']).toBe('')
    })
  })

  describe('TEMPLATE_VARIABLES', () => {
    it('содержит канонические имена и заморожен', () => {
      for (const key of [
        'ticket.id',
        'ticket.title',
        'customer.name',
        'customer.email',
        'agent.name',
        'company.name',
      ]) {
        expect(TEMPLATE_VARIABLES).toContain(key)
      }
      expect(Object.isFrozen(TEMPLATE_VARIABLES)).toBe(true)
    })
  })
})
