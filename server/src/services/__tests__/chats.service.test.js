import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    chat_rooms: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    chat_messages: { create: vi.fn(), findMany: vi.fn() },
    employees: { findUnique: vi.fn() },
  },
}))

import { getChats, getChatById, createMessage, markRead, findOrCreatePersonalChat } from '../chats.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('getChats', () => {
  it('returns sorted chats with last_message', async () => {
    const now = new Date()
    const earlier = new Date(Date.now() - 10000)
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
    const result = await getChatById(1)
    expect(result.name).toBe('Test')
    expect(result.messages).toHaveLength(1)
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
  it('resets unread counter', async () => {
    prisma.chat_rooms.update.mockResolvedValue({})
    await markRead(1)
    expect(prisma.chat_rooms.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { unread: 0 },
    })
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
