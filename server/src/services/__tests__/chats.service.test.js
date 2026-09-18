import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    chat_rooms: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    chat_messages: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    chat_read_receipts: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    employees: { findUnique: vi.fn() },
  },
}))

import { getChats, getChatById, createMessage, markRead, findOrCreatePersonalChat } from '../chats.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('getChats', () => {
  it('returns sorted chats with last_message', async () => {
    const now = new Date()
    prisma.chat_rooms.findMany.mockResolvedValue([
      { id: 1, name: 'Old', type: 'group', chat_messages: [] },
      { id: 2, name: 'New', type: 'personal', chat_messages: [{ text: 'hi', created_at: now }] },
    ])
    const result = await getChats()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(2)
    expect(result[0].last_message).toBe('hi')
    expect(result[1].last_message).toBeNull()
  })
})

describe('getChatById', () => {
  it('returns chat with messages when found', async () => {
    prisma.chat_rooms.findUnique.mockResolvedValue({ id: 1, name: 'Test' })
    prisma.chat_messages.findMany.mockResolvedValue([{ id: 1, text: 'hello' }])
    prisma.chat_messages.count.mockResolvedValue(1)
    prisma.chat_read_receipts.findMany.mockResolvedValue([{ user_id: 2, last_read_message_id: 1, last_read_at: new Date() }])
    const result = await getChatById(1)
    expect(result.name).toBe('Test')
    expect(result.messages).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.readers).toEqual([{ userId: 2, lastReadMessageId: 1, lastReadAt: expect.any(Date) }])
  })

  it('returns null when chat not found', async () => {
    prisma.chat_rooms.findUnique.mockResolvedValue(null)
    const result = await getChatById(999)
    expect(result).toBeNull()
  })
})

describe('createMessage', () => {
  it('creates message with correct data', async () => {
    prisma.chat_messages.create.mockResolvedValue({ id: 1 })
    await createMessage({ chatId: 1, userId: 1, userName: 'Alice', text: 'hello' })
    expect(prisma.chat_messages.create).toHaveBeenCalledWith({
      data: { chat_id: 1, sender_id: 1, sender_name: 'Alice', text: 'hello' },
    })
  })
})

describe('markRead', () => {
  it('upserts read receipt with cursor and resets unread', async () => {
    prisma.chat_read_receipts.findUnique.mockResolvedValue(null)
    prisma.chat_read_receipts.upsert.mockResolvedValue({ id: 1, chat_id: 1, user_id: 1, last_read_message_id: 5 })
    prisma.chat_rooms.update.mockResolvedValue({})
    const result = await markRead(1, 1, 5)
    expect(prisma.chat_read_receipts.upsert).toHaveBeenCalledWith({
      where: { chat_id_user_id: { chat_id: 1, user_id: 1 } },
      update: { last_read_message_id: 5, last_read_at: expect.any(Date) },
      create: { chat_id: 1, user_id: 1, last_read_message_id: 5, last_read_at: expect.any(Date) },
    })
    expect(prisma.chat_rooms.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { unread: 0 },
    })
    expect(result.last_read_message_id).toBe(5)
  })

  it('keeps existing cursor when no lastReadMessageId passed', async () => {
    prisma.chat_read_receipts.findUnique.mockResolvedValue({ last_read_message_id: 7, last_read_at: new Date() })
    prisma.chat_read_receipts.upsert.mockResolvedValue({ id: 1, chat_id: 1, user_id: 1, last_read_message_id: 7 })
    prisma.chat_rooms.update.mockResolvedValue({})
    await markRead(1, 1, null)
    expect(prisma.chat_read_receipts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ last_read_message_id: 7 }),
      }),
    )
  })
})

describe('findOrCreatePersonalChat', () => {
  it('returns existing chat', async () => {
    prisma.employees.findUnique.mockResolvedValue({ name: 'Bob' })
    prisma.chat_rooms.findFirst.mockResolvedValue({ id: 10, name: 'Bob', type: 'personal' })
    const result = await findOrCreatePersonalChat(2, 1)
    expect(result.chat.id).toBe(10)
    expect(result.created).toBe(false)
  })

  it('creates new personal chat', async () => {
    prisma.employees.findUnique.mockResolvedValue({ name: 'Bob' })
    prisma.chat_rooms.findFirst.mockResolvedValue(null)
    prisma.chat_rooms.create.mockResolvedValue({ id: 11, name: 'Bob', type: 'personal' })
    const result = await findOrCreatePersonalChat(2, 1)
    expect(result.chat.id).toBe(11)
    expect(result.created).toBe(true)
  })

  it('returns error when user not found', async () => {
    prisma.employees.findUnique.mockResolvedValue(null)
    const result = await findOrCreatePersonalChat(999, 1)
    expect(result.error).toBe('User not found')
  })
})
