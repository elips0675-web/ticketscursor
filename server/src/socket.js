import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import jwt from 'jsonwebtoken'
import prisma from './prisma.js'
import { JWT_SECRET } from './middleware.js'
import { hasRole } from './utils/roleUtils.js'
import { createNotification } from './routes/notifications.js'
import logger from './logger.js'

let io

// Connection rate limiter: 10 handshake attempts/min per IP
const connAttempts = new Map()

// In-memory rate limiter: 5 msg/sec per socket, exponential backoff on violation
const rateLimitMap = new Map()
const WS_LIMIT = 5
const WS_INTERVAL = 1000
const BACKOFF_MULTIPLIER = 2
const MAX_BACKOFF = 60000

function wsRateLimit(socket) {
  const now = Date.now()
  let entry = rateLimitMap.get(socket.id)
  if (!entry) {
    entry = { tokens: WS_LIMIT, lastRefill: now, backoff: 0, violations: 0 }
    rateLimitMap.set(socket.id, entry)
  }
  // Refill tokens
  const elapsed = now - entry.lastRefill
  entry.tokens = Math.floor(Math.min(WS_LIMIT, entry.tokens + elapsed * (WS_LIMIT / WS_INTERVAL)))
  entry.lastRefill = now
  // Apply backoff if in penalty
  if (entry.backoff > 0) {
    if (now < entry.backoff) return false
    entry.backoff = 0
  }
  if (entry.tokens < 1) {
    entry.violations++
    entry.backoff = now + Math.min(MAX_BACKOFF, Math.pow(BACKOFF_MULTIPLIER, entry.violations) * 1000)
    return false
  }
  entry.tokens -= 1
  entry.violations = 0
  return true
}

export async function setupSocket(server) {
  io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
  })

  // Redis adapter with fallback to in-memory
  if (process.env.REDIS_URL) {
    try {
      const { default: Redis } = await import('ioredis')
      const pubClient = new Redis(process.env.REDIS_URL)
      const subClient = pubClient.duplicate()
      io.adapter(createAdapter(pubClient, subClient))
      console.log('Socket.io using Redis adapter')
    } catch (err) {
      console.warn('Redis unavailable, using in-memory adapter:', err.message)
    }
  }

  io.use((socket, next) => {
    const ip = socket.handshake.address
    // Skip rate-limit for internal NAT subnets (office 100+ users behind 1 IP)
    const isInternal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) ||
      ip.startsWith('10.') || ip.startsWith('192.168.') ||
      (ip.startsWith('172.') && /^172\.(1[6-9]|2\d|3[01])\./.test(ip))
    if (!isInternal) {
      const now = Date.now()
      const attempts = connAttempts.get(ip) || []
      const recent = attempts.filter(t => now - t < 60000)
      if (recent.length >= 10) return next(new Error('Too many connections'))
      recent.push(now)
      connAttempts.set(ip, recent)
    }

    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('No token'))
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      socket.userId = decoded.userId
      socket.userRole = decoded.role
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`WS user ${socket.userId} connected`)
    socket.join(`user:${socket.userId}`)

    // Онлайн-статус
    prisma.employees.update({ where: { id: socket.userId }, data: { online: true } })
      .then(() => io.emit('user:status', { userId: socket.userId, online: true }))
      .catch(() => {})

    // Offline message delivery — найти непрочитанные сообщения с момента последней активности
    prisma.employees.findUnique({
      where: { id: socket.userId },
      select: { last_active: true },
    }).then((user) => {
      if (!user?.last_active) return
      const since = new Date(user.last_active)
      // Найти чаты, где пользователь участвовал (отправлял сообщения)
      prisma.chat_messages.findMany({
        where: {
          chat: {
            chat_messages: { some: { sender_id: socket.userId } },
          },
          created_at: { gt: since },
          sender_id: { not: socket.userId },
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      }).then((missed) => {
        for (const msg of missed) {
          socket.emit('message:new', msg)
        }
      }).catch(() => {})
    }).catch(() => {})

    socket.on('join:chat', (chatId) => {
      socket.join(`chat:${chatId}`)
    })

    socket.on('leave:chat', (chatId) => {
      socket.leave(`chat:${chatId}`)
    })

    socket.on('message:send', async ({ chatId, text }) => {
      if (!text?.trim()) return
      if (text.length > 2000) return socket.emit('error', { message: 'Text too long (max 2000 chars)' })
      if (!wsRateLimit(socket)) return socket.emit('rate:limited', { event: 'message:send' })
      try {
        const user = await prisma.employees.findUnique({ where: { id: socket.userId }, select: { name: true } })
        const senderName = user?.name || 'User'
        const msg = await prisma.chat_messages.create({
          data: {
            chat_id: chatId,
            sender_id: socket.userId,
            sender_name: senderName,
            text,
          },
        })
        io.to(`chat:${chatId}`).emit('message:new', msg)
        // Уведомление участникам чата кроме отправителя
        const participants = await prisma.chat_messages.findMany({
          where: { chat_id: chatId, sender_id: { not: socket.userId } },
          distinct: ['sender_id'],
          select: { sender_id: true },
        })
        for (const p of participants) {
          await createNotification({
            userId: p.sender_id,
            type: 'chat_message',
            title: senderName,
            body: text,
            link: `/chats/${chatId}`,
          })
        }
      } catch (err) {
        logger.error('WS message error:', err)
      }
    })

    socket.on('chat:typing', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('chat:typing', { userId: socket.userId })
    })

    socket.on('message:read', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('chat:read', { chatId, userId: socket.userId })
    })

    socket.on('message:delete', async ({ chatId, msgId }) => {
      try {
        const msg = await prisma.chat_messages.findUnique({ where: { id: msgId } })
        if (!msg) return
        const isAdmin = hasRole(socket.userRole, 'senior_agent')
        if (!isAdmin && msg.sender_id !== socket.userId) return
        await prisma.chat_messages.delete({ where: { id: msgId } })
        io.to(`chat:${chatId}`).emit('message:removed', msgId)
      } catch (err) {
        logger.error('WS delete error:', err)
      }
    })

    socket.on('join:ticket', (ticketId) => {
      socket.join(`ticket:${ticketId}`)
    })

    socket.on('leave:ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`)
    })

    socket.on('ticket:update', (ticketId) => {
      if (!wsRateLimit(socket)) return socket.emit('rate:limited', { event: 'ticket:update' })
      io.to(`ticket:${ticketId}`).emit('ticket:updated', ticketId)
    })

    socket.on('notify:all', (data) => {
      if (!wsRateLimit(socket)) return socket.emit('rate:limited', { event: 'notify:all' })
      socket.broadcast.emit('notification', data)
    })

    socket.on('disconnect', () => {
      console.log(`WS user ${socket.userId} disconnected`)
      prisma.employees.update({
        where: { id: socket.userId },
        data: { online: false, last_active: new Date() },
      }).then(() => io.emit('user:status', { userId: socket.userId, online: false }))
        .catch(() => {})
    })
  })

  return io
}

export { wsRateLimit }

export function getIO() {
  return io || null
}
