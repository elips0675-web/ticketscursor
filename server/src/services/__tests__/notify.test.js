import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    tickets: {
      findUnique: vi.fn(),
    },
    ticket_messages: {
      findMany: vi.fn(),
    },
    employees: {
      findMany: vi.fn(),
    },
    notifications: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    notification_preferences: {
      findUnique: vi.fn(),
    },
    push_subscriptions: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue() },
}))

vi.mock('../../email.js', () => ({ sendTicketNotification: vi.fn().mockResolvedValue() }))
vi.mock('../../telegram.js', () => ({ sendTelegramNotification: vi.fn() }))
vi.mock('../../routes/notifications.js', () => ({ createNotification: vi.fn().mockResolvedValue() }))
vi.mock('../../logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn() } }))

import prisma from '../../prisma.js'
import { sendTicketNotification } from '../../email.js'
import { sendTelegramNotification } from '../../telegram.js'
import { createNotification } from '../../routes/notifications.js'
import { invalidateNotificationPrefsCache } from '../../notification-prefs.js'
import {
  notifyTicketCreated,
  notifyStatusChanged,
  notifyPriorityChanged,
  notifyTicketAssigned,
  notifyTicketMessage,
  notifySlaBreached,
} from '../../notify.js'

const mockTicket = {
  id: 1,
  title: 'Test ticket',
  status: 'open',
  priority: 'medium',
  category: 'IT',
  created_by: 10,
  assigned_to: 20,
  due_at: new Date(Date.now() - 3600000),
  created_by_employee: { id: 10, name: 'Creator', email: 'creator@test.com' },
  assigned_to_employee: { id: 20, name: 'Assignee', email: 'assignee@test.com' },
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.tickets.findUnique.mockResolvedValue(mockTicket)
  prisma.ticket_messages.findMany.mockResolvedValue([{ sender_id: 30 }])
  prisma.employees.findMany.mockResolvedValue([
    { id: 99, email: 'admin@test.com', name: 'Admin' },
  ])
  prisma.notifications.findMany.mockResolvedValue([])
  prisma.notification_preferences.findUnique.mockResolvedValue(null)
  prisma.push_subscriptions.findMany.mockResolvedValue([])
  invalidateNotificationPrefsCache(10)
  invalidateNotificationPrefsCache(20)
  invalidateNotificationPrefsCache(30)
  invalidateNotificationPrefsCache(99)
})

describe('notifyTicketCreated', () => {
  it('sends notification to creator', async () => {
    await notifyTicketCreated(1, 'User')
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 10, type: 'ticket_created',
    }))
  })

  it('sends email to creator', async () => {
    await notifyTicketCreated(1, 'User')
    expect(sendTicketNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'creator@test.com',
    }))
  })

  it('sends telegram notification', async () => {
    await notifyTicketCreated(1, 'User')
    expect(sendTelegramNotification).toHaveBeenCalled()
  })

  it('returns early if ticket not found', async () => {
    prisma.tickets.findUnique.mockResolvedValue(null)
    await notifyTicketCreated(999, 'User')
    expect(createNotification).not.toHaveBeenCalled()
  })
})

describe('notifyStatusChanged', () => {
  it('notifies creator and assignee', async () => {
    await notifyStatusChanged(1, 'open', 'in_progress', 'Admin')
    expect(createNotification).toHaveBeenCalledTimes(2)
  })

  it('sends email to creator and assignee', async () => {
    await notifyStatusChanged(1, 'open', 'resolved', 'Admin')
    expect(sendTicketNotification).toHaveBeenCalledTimes(2)
  })
})

describe('notifyPriorityChanged', () => {
  it('sends telegram, in-app and email notifications', async () => {
    await notifyPriorityChanged(1, 'low', 'critical', 'Admin')
    expect(sendTelegramNotification).toHaveBeenCalled()
    expect(createNotification).toHaveBeenCalled()
    expect(sendTicketNotification).toHaveBeenCalled()
  })
})

describe('notifyTicketAssigned', () => {
  it('notifies assignee', async () => {
    await notifyTicketAssigned(1, 20, 'Admin')
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 20, type: 'ticket_assigned',
    }))
  })

  it('does not notify if assignee is creator', async () => {
    await notifyTicketAssigned(1, 10, 'Admin')
    expect(createNotification).not.toHaveBeenCalled()
  })
})

describe('notifyTicketMessage', () => {
  it('notifies participants except sender', async () => {
    await notifyTicketMessage(1, 10, 'Creator', 'Hello')
    expect(createNotification).toHaveBeenCalled()
    const calledFor = createNotification.mock.calls.map(c => c[0].userId)
    expect(calledFor).not.toContain(10)
  })
})

describe('sendEmail — error handling', () => {
  it('handles sendTicketNotification rejection gracefully', async () => {
    sendTicketNotification.mockRejectedValueOnce(new Error('SMTP error'))
    await notifyTicketCreated(1, 'User')
    expect(createNotification).toHaveBeenCalled()
  })

  it('handles createNotification rejection gracefully', async () => {
    createNotification.mockRejectedValueOnce(new Error('DB error'))
    await notifyTicketCreated(1, 'User')
    expect(sendTicketNotification).toHaveBeenCalled()
  })
})

describe('notifyTicketCreated — missing email', () => {
  it('skips email when creator has no email', async () => {
    prisma.tickets.findUnique.mockResolvedValue({
      ...mockTicket,
      created_by_employee: { id: 10, name: 'Creator', email: null },
    })
    await notifyTicketCreated(1, 'User')
    expect(sendTicketNotification).not.toHaveBeenCalled()
  })
})

describe('notifySlaBreached', () => {
  it('notifies all targets when not recently notified', async () => {
    await notifySlaBreached(1)
    expect(createNotification).toHaveBeenCalled()
  })

  it('skips users already notified in last 24h', async () => {
    prisma.notifications.findMany.mockResolvedValue([{ user_id: 10 }, { user_id: 20 }, { user_id: 99 }])
    await notifySlaBreached(1)
    expect(createNotification).not.toHaveBeenCalled()
    expect(prisma.notifications.findMany).toHaveBeenCalledWith({
      where: {
        user_id: { in: expect.arrayContaining([10, 20, 99]) },
        type: 'ticket_sla_overdue',
        link: '/tickets/1',
        created_at: { gte: expect.any(Date) },
      },
      select: { user_id: true },
    })
  })

  it('sends email to admins', async () => {
    await notifySlaBreached(1)
    expect(sendTicketNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@test.com',
    }))
  })

  it('returns early if ticket not found', async () => {
    prisma.tickets.findUnique.mockResolvedValue(null)
    await notifySlaBreached(1)
    expect(createNotification).not.toHaveBeenCalled()
  })
})

describe('notification preferences — фильтрация каналов (Этап 63, подфича 3)', () => {
  function prefsByUser(map) {
    prisma.notification_preferences.findUnique.mockImplementation(({ where }) => {
      const p = map[where.user_id]
      return Promise.resolve(p ? { prefs: JSON.stringify(p) } : null)
    })
  }

  it('skips email when creator disabled email for ticket_created', async () => {
    prefsByUser({ 10: { ticket_created: { email: false, push: true, in_app: true } } })
    await notifyTicketCreated(1, 'User')
    expect(sendTicketNotification).not.toHaveBeenCalled()
    expect(createNotification).toHaveBeenCalled()
  })

  it('skips in-app notification when creator disabled in_app', async () => {
    prefsByUser({ 10: { ticket_created: { email: true, push: true, in_app: false } } })
    await notifyTicketCreated(1, 'User')
    expect(createNotification).not.toHaveBeenCalled()
    expect(sendTicketNotification).toHaveBeenCalled()
  })

  it('filters in-app по пользователям: у 10 выключен, у 20 — включён', async () => {
    prefsByUser({ 10: { ticket_status: { email: true, push: true, in_app: false } } })
    await notifyStatusChanged(1, 'open', 'in_progress', 'Admin')
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification.mock.calls[0][0].userId).toBe(20)
  })

  it('sends push when push enabled and subscription exists', async () => {
    prisma.push_subscriptions.findMany.mockResolvedValue([
      { user_id: 10, subscription_json: JSON.stringify({ endpoint: 'https://example.com/push' }) },
    ])
    await notifyTicketCreated(1, 'User')
    const WebPush = (await import('web-push')).default
    await vi.waitFor(() => expect(WebPush.sendNotification).toHaveBeenCalled())
  })

  it('does not send push when push disabled for event', async () => {
    prefsByUser({ 10: { ticket_created: { email: true, push: false, in_app: true } } })
    prisma.push_subscriptions.findMany.mockResolvedValue([
      { user_id: 10, subscription_json: JSON.stringify({ endpoint: 'https://example.com/push' }) },
    ])
    await notifyTicketCreated(1, 'User')
    const WebPush = (await import('web-push')).default
    expect(WebPush.sendNotification).not.toHaveBeenCalled()
  })
})
