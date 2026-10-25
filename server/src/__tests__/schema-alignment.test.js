// Регрессия дрейфа «Prisma ↔ миграции»: тест ходит в реальную тестовую БД,
// которую vitest.global-setup собирает только из миграций (без заплаток
// test-db-setup.js). Моки Prisma такие дефекты не ловят: они принимают любые
// аргументы, поэтому email_message_id жил в запросах, отсутствуя в схеме.
import { describe, it, expect, afterAll } from 'vitest'
import prisma from '../prisma.js'

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const email = `schema_${suffix}@example.com`
const messageId = `message-${suffix}@example.com`
let employeeId = null
let ticketId = null

afterAll(async () => {
  if (ticketId) await prisma.tickets.delete({ where: { id: ticketId } }).catch(() => {})
  if (employeeId) await prisma.employees.delete({ where: { id: employeeId } }).catch(() => {})
  await prisma.$disconnect()
})

describe('Схема свежей БД совпадает с Prisma', () => {
  it('принимает роль super_admin (11 символов) без усечения', async () => {
    const employee = await prisma.employees.create({
      data: { name: 'Schema Check', email, password_hash: 'x', role: 'super_admin' },
    })
    employeeId = employee.id
    expect(employee.role).toBe('super_admin')
  })

  it('принимает статус reopened и произвольную категорию тикета', async () => {
    const ticket = await prisma.tickets.create({
      data: {
        title: 'Schema check',
        description: 'D',
        status: 'reopened',
        priority: 'medium',
        category: 'network',
        created_by: employeeId,
      },
    })
    ticketId = ticket.id
    expect(ticket.status).toBe('reopened')
    expect(ticket.category).toBe('network')
  })

  it('находит тикет по email_message_id (поле объявлено в Prisma)', async () => {
    const updated = await prisma.tickets.update({
      where: { id: ticketId },
      data: { email_message_id: messageId },
    })
    expect(updated.email_message_id).toBe(messageId)

    const found = await prisma.tickets.findFirst({
      where: { email_message_id: messageId, deleted_at: null },
      select: { id: true },
    })
    expect(found?.id).toBe(ticketId)
  })
})
