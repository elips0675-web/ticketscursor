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
  const [messages, total] = await Promise.all([
    prisma.chat_messages.findMany({
      where: { chat_id: id },
      orderBy: { created_at: 'asc' },
      take: limit,
      skip,
    }),
    prisma.chat_messages.count({ where: { chat_id: id } }),
  ])
  return { ...chat, messages, total, page, totalPages: Math.ceil(total / limit) }
}

export async function createMessage({ chatId, userId, userName, text }) {
  return prisma.chat_messages.create({
    data: { chat_id: chatId, sender_id: userId, sender_name: userName, text },
  })
}

export async function getChatParticipants(chatId, excludeUserId) {
  return prisma.chat_messages.findMany({
    where: { chat_id: chatId, sender_id: { not: excludeUserId } },
    distinct: ['sender_id'],
    select: { sender_id: true },
  })
}

export async function markRead(chatId) {
  await prisma.chat_rooms.update({
    where: { id: chatId },
    data: { unread: 0 },
  })
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
