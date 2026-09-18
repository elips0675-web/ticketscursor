import prisma from '../prisma.js'

export async function getChats() {
  const rooms = await prisma.chat_rooms.findMany({
    include: {
      chat_messages: {
        take: 1,
        orderBy: { created_at: 'desc' },
      },
    },
  })
  return rooms
    .map(({ chat_messages, ...c }) => ({
      ...c,
      last_message: chat_messages[0]?.text || null,
      last_time: chat_messages[0]?.created_at || null,
    }))
    .sort((a, b) => {
      if (!a.last_time) return 1
      if (!b.last_time) return -1
      return new Date(b.last_time) - new Date(a.last_time)
    })
}

export async function getChatById(id, page = 1, limit = 50) {
  const chat = await prisma.chat_rooms.findUnique({ where: { id } })
  if (!chat) return null
  const skip = (page - 1) * limit
  const [messages, total, receipts] = await Promise.all([
    prisma.chat_messages.findMany({
      where: { chat_id: id, deleted_at: null },
      orderBy: { created_at: 'asc' },
      take: limit,
      skip,
    }),
    prisma.chat_messages.count({ where: { chat_id: id, deleted_at: null } }),
    prisma.chat_read_receipts.findMany({ where: { chat_id: id } }),
  ])
  return {
    ...chat,
    messages,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    readers: receipts.map((r) => ({
      userId: r.user_id,
      lastReadMessageId: r.last_read_message_id,
      lastReadAt: r.last_read_at,
    })),
  }
}

export async function createMessage({ chatId, userId, userName, text }) {
  const [msg] = await Promise.all([
    prisma.chat_messages.create({
      data: { chat_id: chatId, sender_id: userId, sender_name: userName, text },
    }),
    prisma.chat_rooms.update({
      where: { id: chatId },
      data: { unread: { increment: 1 } },
    }),
  ])
  return msg
}

export async function getChatParticipants(chatId, excludeUserId) {
  return prisma.chat_messages.findMany({
    where: { chat_id: chatId, sender_id: { not: excludeUserId } },
    distinct: ['sender_id'],
    select: { sender_id: true },
  })
}

export async function markRead(chatId, userId, lastReadMessageId) {
  const existing = await prisma.chat_read_receipts.findUnique({
    where: { chat_id_user_id: { chat_id: chatId, user_id: userId } },
    select: { last_read_message_id: true, last_read_at: true },
  })
  const cursor = lastReadMessageId || existing?.last_read_message_id || null
  const [receipt] = await Promise.all([
    prisma.chat_read_receipts.upsert({
      where: { chat_id_user_id: { chat_id: chatId, user_id: userId } },
      update: { last_read_message_id: cursor, last_read_at: new Date() },
      create: { chat_id: chatId, user_id: userId, last_read_message_id: cursor, last_read_at: new Date() },
    }),
    prisma.chat_rooms.update({ where: { id: chatId }, data: { unread: 0 } }),
  ])
  return receipt
}

export async function findOrCreatePersonalChat(userId, _myId) {
  const user = await prisma.employees.findUnique({
    where: { id: userId },
    select: { name: true },
  })
  if (!user) return { error: 'User not found' }
  const existing = await prisma.chat_rooms.findFirst({
    where: { type: 'personal', name: user.name },
  })
  if (existing) return { chat: existing, created: false }
  const chat = await prisma.chat_rooms.create({
    data: { name: user.name, type: 'personal' },
  })
  return { chat, created: true }
}
