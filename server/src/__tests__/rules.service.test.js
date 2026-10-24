import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  default: {
    automation_rules: { findMany: vi.fn(), update: vi.fn() },
    tickets: { findUnique: vi.fn() },
    notifications: { create: vi.fn() },
  },
}))

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../settings.js', () => ({
  getSettings: vi.fn().mockResolvedValue({ COMPANY_NAME: 'Acme' }),
}))

import prisma from '../prisma.js'
import logger from '../logger.js'
import { getSettings } from '../settings.js'
import { evaluateRules } from '../services/rules.service.js'

const TICKET = {
  id: 7,
  title: 'VPN не работает',
  status: 'open',
  priority: 'high',
  category: 'network',
  created_by_employee: { name: 'Иван', email: 'ivan@example.com' },
  assigned_to_employee: { name: 'Мария', email: 'maria@example.com' },
}

function ruleWith(message) {
  return {
    id: 1,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_notification', params: { message } }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.automation_rules.findMany.mockResolvedValue([])
  prisma.automation_rules.update.mockResolvedValue({})
  prisma.notifications.create.mockResolvedValue({})
  getSettings.mockResolvedValue({ COMPANY_NAME: 'Acme' })
})

describe('rules.service — send_notification merge fields (CHW-07)', () => {
  it('подставляет customer/agent/company/ticket и отправляет уведомление', async () => {
    prisma.automation_rules.findMany.mockResolvedValue([
      ruleWith('Привет, {{customer.name}}! Тикет #{{ticket.id}} «{{ticket.title}}» ведёт {{agent.name}} — {{company.name}}'),
    ])
    prisma.tickets.findUnique.mockResolvedValue(TICKET)

    const executed = await evaluateRules('ticket.created', { ticketId: 7, userId: 3 })

    expect(executed).toBe(1)
    expect(prisma.notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 3,
        message: 'Привет, Иван! Тикет #7 «VPN не работает» ведёт Мария — Acme',
        link: '/tickets/7',
      }),
    })
    expect(prisma.tickets.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: expect.objectContaining({ created_by_employee: expect.any(Object) }),
    })
  })

  it('поддерживает старое имя {{ticketId}}', async () => {
    prisma.automation_rules.findMany.mockResolvedValue([ruleWith('Тикет #{{ticketId}} обновлён')])
    prisma.tickets.findUnique.mockResolvedValue(TICKET)

    await evaluateRules('ticket.updated', { ticketId: 7, userId: 3 })

    expect(prisma.notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ message: 'Тикет #7 обновлён' }),
    })
  })

  it('при ошибке загрузки тикета не падает: подставляет id и логирует предупреждение', async () => {
    prisma.automation_rules.findMany.mockResolvedValue([ruleWith('Тикет #{{ticketId}}')])
    prisma.tickets.findUnique.mockRejectedValue(new Error('db down'))

    const executed = await evaluateRules('ticket.created', { ticketId: 7, userId: 3 })

    expect(executed).toBe(1)
    expect(prisma.notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ message: 'Тикет #7' }),
    })
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('db down'))
  })

  it('не отправляет уведомление, если условие правила не выполнено', async () => {
    prisma.automation_rules.findMany.mockResolvedValue([
      {
        id: 2,
        conditions: { logic: 'and', rules: [{ field: 'priority', operator: 'equals', value: 'critical' }] },
        actions: [{ type: 'send_notification', params: { message: 'x' } }],
      },
    ])

    const executed = await evaluateRules('ticket.created', { ticketId: 7, userId: 3, priority: 'low' })

    expect(executed).toBe(0)
    expect(prisma.notifications.create).not.toHaveBeenCalled()
  })

  it('не отправляет уведомление без userId', async () => {
    prisma.automation_rules.findMany.mockResolvedValue([ruleWith('Привет')])

    await evaluateRules('ticket.created', { ticketId: 7 })

    expect(prisma.notifications.create).not.toHaveBeenCalled()
  })
})
