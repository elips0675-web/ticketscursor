import { describe, it, expect } from 'vitest'
import { buildAutoReply } from '../services/email-ingestion.service.js'

describe('email-ingestion — автоответ merge fields (CHW-07)', () => {
  it('подставляет имя клиента, номер и тему тикета, компанию', () => {
    const { subject, text } = buildAutoReply({
      ticket: { id: 12, title: 'Не приходит счёт' },
      customer: { name: 'Иван Петров', email: 'ivan@example.com' },
      company: { name: 'Acme' },
    })

    expect(subject).toBe('[Ticket #12] Не приходит счёт')
    expect(text).toContain('Спасибо за обращение, Иван Петров!')
    expect(text).toContain('Ваш тикет создан: #12')
    expect(text).toContain('Тема: Не приходит счёт')
    expect(text).toContain('— Acme')
  })

  it('не оставляет известных плейсхолдеров в тексте', () => {
    const { subject, text } = buildAutoReply({
      ticket: { id: 3, title: 'Вопрос' },
      customer: { name: 'Мария', email: 'maria@example.com' },
      company: { name: 'Acme' },
    })

    expect(`${subject}\n${text}`).not.toMatch(/\{\{\s*(ticket|customer|agent|company)\./)
  })

  it('не пишет "undefined", если имя клиента неизвестно', () => {
    const { text } = buildAutoReply({
      ticket: { id: 4, title: 'Без имени' },
      customer: { email: 'anon@example.com' },
      company: { name: 'Acme' },
    })

    expect(text).not.toContain('undefined')
    expect(text).toContain('Спасибо за обращение, !')
  })
})
