import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import jwt from 'jsonwebtoken'
import pool from './db.js'
import { JWT_SECRET } from './middleware.js'

let io

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
  entry.tokens = Math.min(WS_LIMIT, entry.tokens + elapsed * (WS_LIMIT / WS_INTERVAL))
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

    socket.on('join:chat', (chatId) => {
      socket.join(`chat:${chatId}`)
    })

    socket.on('leave:chat', (chatId) => {
      socket.leave(`chat:${chatId}`)
    })

    socket.on('message:send', async ({ chatId, text }) => {
      if (!text?.trim()) return
      if (!wsRateLimit(socket)) return socket.emit('rate:limited', { event: 'message:send' })
      try {
        const [user] = await pool.query('SELECT name FROM employees WHERE id = ?', [socket.userId])
        const senderName = user[0]?.name || 'User'
        const [result] = await pool.query(
          'INSERT INTO chat_messages (chat_id, sender_id, sender_name, text) VALUES (?, ?, ?, ?)',
          [chatId, socket.userId, senderName, text],
        )
        const [[msg]] = await pool.query('SELECT * FROM chat_messages WHERE id = ?', [result.insertId])
        io.to(`chat:${chatId}`).emit('message:new', msg)
      } catch (err) {
        console.error('WS message error:', err)
      }
    })

    socket.on('message:delete', async ({ chatId, msgId }) => {
      try {
        const [[msg]] = await pool.query('SELECT * FROM chat_messages WHERE id = ?', [msgId])
        if (!msg) return
        const isAdmin = socket.userRole === 'admin' || socket.userRole === 'senior_agent'
        if (!isAdmin && msg.sender_id !== socket.userId) return
        await pool.query('DELETE FROM chat_messages WHERE id = ?', [msgId])
        io.to(`chat:${chatId}`).emit('message:removed', msgId)
      } catch (err) {
        console.error('WS delete error:', err)
      }
    })

    socket.on('ticket:update', (ticketId) => {
      if (!wsRateLimit(socket)) return socket.emit('rate:limited', { event: 'ticket:update' })
      io.emit('ticket:updated', ticketId)
    })

    socket.on('notify:all', (data) => {
      if (!wsRateLimit(socket)) return socket.emit('rate:limited', { event: 'notify:all' })
      socket.broadcast.emit('notification', data)
    })

    socket.on('disconnect', () => {
      console.log(`WS user ${socket.userId} disconnected`)
    })
  })

  return io
}

export function getIO() {
  return io || null
}
