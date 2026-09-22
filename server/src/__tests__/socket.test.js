import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createServer } from 'http'
import { io as ioc } from 'socket.io-client'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'

// SOCKET.IO НЕ мокаем — поднимаем реальный сервер на порту 0 и реальную БД (servicedesk_test из global-setup).
// JWT_SECRET задаём ДО динамического импорта socket.js (middleware.js читает env в момент загрузки модуля).
const JWT_SECRET = 'test-socket-secret-8f3a1c9e'
process.env.JWT_SECRET = JWT_SECRET

let socketModule
let httpServer
let io
let port

// Уникальные сотрудники этого файла (не трогаем seed-данные)
let empA
let empB
let empC

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Все открытые сокеты трекаем — afterAll закроет оставшиеся, чтобы httpServer.close() не завис
const openSockets = new Set()

function connect(token, opts = {}) {
  const sock = ioc(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { token },
    ...opts,
  })
  openSockets.add(sock)
  return sock
}

function waitForConnect(sock, timeout = 4000) {
  return new Promise((resolve, reject) => {
    // Сокет мог уже успеть подключиться до установки слушателя (создали оба сразу)
    if (sock.connected) return resolve()
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`Socket connect timeout (${sock.id || 'no-id'})`))
    }, timeout)
    sock.once('connect', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve()
      }
    })
    sock.once('connect_error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

function waitFor(sock, event, timeout = 3000, predicate = () => true) {
  return new Promise((resolve, reject) => {
    let timer
    const onEvent = (...args) => {
      if (!predicate(...args)) return
      clearTimeout(timer)
      sock.off(event, onEvent)
      resolve(args.length > 1 ? args : args[0])
    }
    timer = setTimeout(() => {
      sock.off(event, onEvent)
      reject(new Error(`Timeout waiting for '${event}'`))
    }, timeout)
    sock.on(event, onEvent)
  })
}

function waitForN(sock, event, n, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const items = []
    const onEvt = (d) => {
      items.push(d)
      if (items.length === n) {
        clearTimeout(timer)
        sock.off(event, onEvt)
        resolve(items)
      }
    }
    const timer = setTimeout(() => {
      sock.off(event, onEvt)
      reject(new Error(`Only ${items.length}/${n} '${event}' received`))
    }, timeout)
    sock.on(event, onEvt)
  })
}

function assertNoEvent(sock, event, ms = 300) {
  return new Promise((resolve, reject) => {
    let timer
    const onEvent = () => {
      clearTimeout(timer)
      sock.off(event, onEvent)
      reject(new Error(`Unexpected event '${event}'`))
    }
    timer = setTimeout(() => {
      sock.off(event, onEvent)
      resolve()
    }, ms)
    sock.on(event, onEvent)
  })
}

function closeSock(sock) {
  if (!sock) return Promise.resolve()
  openSockets.delete(sock)
  return new Promise((resolve) => {
    sock.close()
    setTimeout(resolve, 30)
  })
}

const makeToken = (userId, role = 'agent', expiresIn = '1h') =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn })

const makeChat = () => prisma.chat_rooms.create({ data: { name: `ws-test-${Date.now()}-${Math.random()}`, type: 'group' } })
const cleanupChat = (chatId) => Promise.all([
  prisma.chat_read_receipts.deleteMany({ where: { chat_id: chatId } }).catch(() => {}),
  prisma.chat_rooms.delete({ where: { id: chatId } }).catch(() => {}),
])

beforeAll(async () => {
  socketModule = await import('../socket.js')
  httpServer = createServer()
  io = await socketModule.setupSocket(httpServer)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  port = httpServer.address().port

  empA = await prisma.employees.create({
    data: { name: 'WS Test A', email: `ws-a-${Date.now()}@test.local`, password_hash: 'x', role: 'agent', department: 'IT', online: false },
  })
  empB = await prisma.employees.create({
    data: { name: 'WS Test B', email: `ws-b-${Date.now()}@test.local`, password_hash: 'x', role: 'agent', department: 'IT', online: false },
  })
  empC = await prisma.employees.create({
    data: { name: 'WS Test C', email: `ws-c-${Date.now()}@test.local`, password_hash: 'x', role: 'senior_agent', department: 'IT', online: false },
  })
})

afterAll(async () => {
  if (empA) await prisma.employees.delete({ where: { id: empA.id } }).catch(() => {})
  if (empB) await prisma.employees.delete({ where: { id: empB.id } }).catch(() => {})
  if (empC) await prisma.employees.delete({ where: { id: empC.id } }).catch(() => {})
  await Promise.all([...openSockets].map(closeSock))
  await new Promise((resolve) => httpServer?.close(resolve))
  await prisma?.$disconnect().catch(() => {})
})

describe('wsRateLimit (unit)', () => {
  let socket

  beforeEach(() => {
    socket = { id: `test-${Date.now()}-${Math.random()}` }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to 5 messages immediately', () => {
    for (let i = 0; i < 5; i++) {
      expect(socketModule.wsRateLimit(socket)).toBe(true)
    }
  })

  it('blocks messages over the limit', () => {
    for (let i = 0; i < 5; i++) socketModule.wsRateLimit(socket)
    expect(socketModule.wsRateLimit(socket)).toBe(false)
  })

  it('refills tokens after 1 second', () => {
    for (let i = 0; i < 5; i++) socketModule.wsRateLimit(socket)
    vi.advanceTimersByTime(1000)
    expect(socketModule.wsRateLimit(socket)).toBe(true)
  })

  it('applies exponential backoff after violations', () => {
    for (let i = 0; i < 5; i++) socketModule.wsRateLimit(socket)
    expect(socketModule.wsRateLimit(socket)).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(socketModule.wsRateLimit(socket)).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(socketModule.wsRateLimit(socket)).toBe(true)
  })

  it('handles multiple sockets independently', () => {
    const s1 = { id: 'socket-a' }
    const s2 = { id: 'socket-b' }
    for (let i = 0; i < 5; i++) socketModule.wsRateLimit(s1)
    expect(socketModule.wsRateLimit(s2)).toBe(true)
  })
})

describe('setupSocket — реальный сервер (порт 0), клиент socket.io-client', () => {
  it('handshake с невалидным JWT → disconnect (connect_error Invalid token)', async () => {
    const sock = connect('garbage-token')
    await expect(waitForConnect(sock)).rejects.toMatchObject({ message: 'Invalid token' })
    await closeSock(sock)
  })

  it('handshake c истёкшим JWT → disconnect (connect_error Invalid token)', async () => {
    const sock = connect(makeToken(empA.id, 'agent', '-10s'))
    await expect(waitForConnect(sock)).rejects.toMatchObject({ message: 'Invalid token' })
    await closeSock(sock)
  })

  it('handshake без токена → connect_error No token', async () => {
    const sock = connect(undefined)
    await expect(waitForConnect(sock)).rejects.toMatchObject({ message: 'No token' })
    await closeSock(sock)
  })

  it('rate-limit: 6-е сообщение message:send за 1с отклоняется (rate:limited)', async () => {
    const chat = await makeChat()
    try {
      const a = connect(makeToken(empA.id))
      await waitForConnect(a)
      a.emit('join:chat', chat.id)
      const acks = waitForN(a, 'message:ack', 5)
      const rateLimited = waitFor(a, 'rate:limited')
      for (let i = 1; i <= 6; i++) {
        a.emit('message:send', { chatId: chat.id, text: `m${i}`, clientId: `c${i}` })
      }
      const lim = await rateLimited
      expect(lim.event).toBe('message:send')
      const received = await acks
      expect(received).toHaveLength(5)
      await closeSock(a)
    } finally {
      await cleanupChat(chat.id)
    }
  })

  it('внутренние/NAT-подсети (127.0.0.1 и 192.168.x в коде) не режутся лимитом подключений', async () => {
    const socks = []
    try {
      for (let i = 0; i < 12; i++) {
        const s = connect(makeToken(empA.id))
        socks.push(s)
        await waitForConnect(s)
      }
      expect(socks.every((s) => s.connected)).toBe(true)
    } finally {
      await Promise.all(socks.map(closeSock))
    }
  }, 15000)

  it('join:ticket → ticket:updated приходит ВСЕМ в комнату', async () => {
    const a = connect(makeToken(empA.id))
    const b = connect(makeToken(empB.id))
    await waitForConnect(a)
    await waitForConnect(b)
    a.emit('join:ticket', 42)
    b.emit('join:ticket', 42)
    await delay(50)
    const aGot = waitFor(a, 'ticket:updated')
    const bGot = waitFor(b, 'ticket:updated')
    a.emit('ticket:update', 42)
    expect(await aGot).toBe(42)
    expect(await bGot).toBe(42)
    await Promise.all([closeSock(a), closeSock(b)])
  })

  it('leave:ticket → после выхода события не приходят', async () => {
    const a = connect(makeToken(empA.id))
    const b = connect(makeToken(empB.id))
    await waitForConnect(a)
    await waitForConnect(b)
    a.emit('join:ticket', 42)
    b.emit('join:ticket', 42)
    await delay(50)
    b.emit('leave:ticket', 42)
    await delay(50)
    const aGot = waitFor(a, 'ticket:updated')
    const noB = assertNoEvent(b, 'ticket:updated')
    a.emit('ticket:update', 42)
    expect(await aGot).toBe(42)
    await noB
    await Promise.all([closeSock(a), closeSock(b)])
  })

  it('leave:chat → после выхода сообщения не приходят (message:new не доставляется)', async () => {
    const chat = await makeChat()
    try {
      const a = connect(makeToken(empA.id))
      const b = connect(makeToken(empB.id))
      await waitForConnect(a)
      await waitForConnect(b)
      a.emit('join:chat', chat.id)
      b.emit('join:chat', chat.id)
      await delay(50)
      b.emit('leave:chat', chat.id)
      await delay(50)
      const aGot = waitFor(a, 'message:ack')
      const noB = assertNoEvent(b, 'message:new')
      a.emit('message:send', { chatId: chat.id, text: 'after-leave', clientId: 'l1' })
      await aGot
      await noB
      await Promise.all([closeSock(a), closeSock(b)])
    } finally {
      await prisma.notifications.deleteMany({ where: { type: 'chat_message' } }).catch(() => {})
      await cleanupChat(chat.id)
    }
  })

  it('chat:typing ретранслируется участникам комнаты (не отправителю)', async () => {
    const a = connect(makeToken(empA.id))
    const b = connect(makeToken(empB.id))
    await waitForConnect(a)
    await waitForConnect(b)
    a.emit('join:chat', 99)
    b.emit('join:chat', 99)
    await delay(50)
    const bGot = waitFor(b, 'chat:typing')
    const noOwn = assertNoEvent(a, 'chat:typing')
    a.emit('chat:typing', { chatId: 99 })
    expect(await bGot).toMatchObject({ userId: empA.id })
    await noOwn
    await Promise.all([closeSock(a), closeSock(b)])
  })

  it('message:read → chat:read участникам + персист в chat_read_receipts + unread=0', async () => {
    const chat = await makeChat()
    const msg = await prisma.chat_messages.create({
      data: { chat_id: chat.id, sender_id: empB.id, sender_name: 'B', text: 'hello' },
    })
    try {
      await prisma.chat_rooms.update({ where: { id: chat.id }, data: { unread: 5 } })
      const a = connect(makeToken(empA.id))
      const b = connect(makeToken(empB.id))
      await waitForConnect(a)
      await waitForConnect(b)
      a.emit('join:chat', chat.id)
      b.emit('join:chat', chat.id)
      await delay(50)
      const bGot = waitFor(b, 'chat:read')
      a.emit('message:read', { chatId: chat.id, lastReadMessageId: msg.id })
      const data = await bGot
      expect(data).toMatchObject({ chatId: chat.id, userId: empA.id, lastReadMessageId: msg.id })
      await delay(150)
      const receipt = await prisma.chat_read_receipts.findUnique({
        where: { chat_id_user_id: { chat_id: chat.id, user_id: empA.id } },
      })
      expect(receipt?.last_read_message_id).toBe(msg.id)
      const room = await prisma.chat_rooms.findUnique({ where: { id: chat.id } })
      expect(room?.unread).toBe(0)
      await Promise.all([closeSock(a), closeSock(b)])
    } finally {
      await cleanupChat(chat.id)
    }
  })

  it('disconnect → user:status offline + сотрудник online=false в БД', async () => {
    const b = connect(makeToken(empB.id))
    await waitForConnect(b)
    const onlineEvt = waitFor(b, 'user:status', 3000, (u) => u.userId === empA.id && u.online === true)
    const a = connect(makeToken(empA.id))
    await waitForConnect(a)
    await onlineEvt
    const offlineEvt = waitFor(b, 'user:status', 3000, (u) => u.userId === empA.id && u.online === false)
    await closeSock(a)
    expect(await offlineEvt).toMatchObject({ userId: empA.id, online: false })
    await delay(150)
    const emp = await prisma.employees.findUnique({ where: { id: empA.id } })
    expect(emp?.online).toBe(false)
    await closeSock(b)
  })

  it('reconnect → offline queue flush (приходят пропущенные сообщения)', async () => {
    const chat = await makeChat()
    try {
      const m1 = await prisma.chat_messages.create({
        data: { chat_id: chat.id, sender_id: empA.id, sender_name: 'A', text: 'first' },
      })
      await prisma.chat_read_receipts.create({
        data: { chat_id: chat.id, user_id: empA.id, last_read_message_id: m1.id },
      })
      const m2 = await prisma.chat_messages.create({
        data: { chat_id: chat.id, sender_id: empB.id, sender_name: 'B', text: 'missed-after-reconnect' },
      })
      const a = connect(makeToken(empA.id))
      const got = waitFor(a, 'message:new', 4000, (msg) => msg.id === m2.id)
      await waitForConnect(a)
      const msg = await got
      expect(msg.text).toBe('missed-after-reconnect')
      await closeSock(a)
    } finally {
      await cleanupChat(chat.id)
    }
  })

  it('message:send → уведомление участникам чата (createNotification персистится)', async () => {
    const chat = await makeChat()
    try {
      // empB уже "участник" чата — server создаст notification для него
      await prisma.chat_messages.create({
        data: { chat_id: chat.id, sender_id: empB.id, sender_name: 'B', text: 'participant' },
      })
      const a = connect(makeToken(empA.id))
      await waitForConnect(a)
      a.emit('join:chat', chat.id)
      const ack = waitFor(a, 'message:ack')
      a.emit('message:send', { chatId: chat.id, text: 'hello participants', clientId: 'n1' })
      const d = await ack
      expect(d.clientId).toBe('n1')
      await delay(200)
      const notif = await prisma.notifications.findFirst({
        where: { user_id: empB.id, type: 'chat_message' },
        orderBy: { id: 'desc' },
      })
      expect(notif?.body).toBe('hello participants')
      expect(notif?.link).toBe(`/chats/${chat.id}`)
      await closeSock(a)
    } finally {
      await prisma.notifications.deleteMany({ where: { type: 'chat_message', user_id: empB.id } }).catch(() => {})
      await cleanupChat(chat.id)
    }
  })

  it('message:send в несуществующий чат → catch логирует ошибку, клиент получает только rate-free тишину', async () => {
    const a = connect(makeToken(empA.id))
    await waitForConnect(a)
    const noAck = assertNoEvent(a, 'message:ack')
    a.emit('message:send', { chatId: 99999999, text: 'bad chat', clientId: 'x' })
    await noAck
    await closeSock(a)
  })

  it('message:send с пустым текстом игнорируется (нет ack и нет rate:limited)', async () => {
    const a = connect(makeToken(empA.id))
    await waitForConnect(a)
    const noAck = assertNoEvent(a, 'message:ack')
    const noLimit = assertNoEvent(a, 'rate:limited')
    a.emit('message:send', { chatId: 1, text: '   ', clientId: 'x' })
    await Promise.all([noAck, noLimit])
    await closeSock(a)
  })

  it('message:send длиннее 2000 символов → error Text too long', async () => {
    const a = connect(makeToken(empA.id))
    await waitForConnect(a)
    const err = waitFor(a, 'error')
    a.emit('message:send', { chatId: 1, text: 'x'.repeat(2001), clientId: 'x' })
    expect(await err).toMatchObject({ message: 'Text too long (max 2000 chars)' })
    await closeSock(a)
  })

  it('notify:all → broadcast notification остальным подключённым', async () => {
    const a = connect(makeToken(empA.id))
    const b = connect(makeToken(empB.id))
    await waitForConnect(a)
    await waitForConnect(b)
    const bGot = waitFor(b, 'notification')
    a.emit('notify:all', { type: 'info', message: 'hello-all' })
    expect(await bGot).toMatchObject({ type: 'info', message: 'hello-all' })
    await Promise.all([closeSock(a), closeSock(b)])
  })

  it('message:delete старшим (senior_agent) → message:removed в комнату + deleted_at', async () => {
    const chat = await makeChat()
    try {
      const msg = await prisma.chat_messages.create({
        data: { chat_id: chat.id, sender_id: empA.id, sender_name: 'A', text: 'to-delete-senior' },
      })
      const a = connect(makeToken(empA.id))
      const c = connect(makeToken(empC.id, 'senior_agent'))
      await waitForConnect(a)
      await waitForConnect(c)
      a.emit('join:chat', chat.id)
      c.emit('join:chat', chat.id)
      await delay(50)
      const removed = waitFor(a, 'message:removed')
      c.emit('message:delete', { chatId: chat.id, msgId: msg.id })
      expect(await removed).toBe(msg.id)
      await delay(150)
      const row = await prisma.chat_messages.findUnique({ where: { id: msg.id } })
      expect(row?.deleted_at).not.toBeNull()
      await Promise.all([closeSock(a), closeSock(c)])
    } finally {
      await cleanupChat(chat.id)
    }
  })

  it('message:delete владельцем (agent) → разрешено', async () => {
    const chat = await makeChat()
    try {
      const msg = await prisma.chat_messages.create({
        data: { chat_id: chat.id, sender_id: empA.id, sender_name: 'A', text: 'to-delete-owner' },
      })
      const a = connect(makeToken(empA.id))
      await waitForConnect(a)
      a.emit('join:chat', chat.id)
      await delay(50)
      const removed = waitFor(a, 'message:removed')
      a.emit('message:delete', { chatId: chat.id, msgId: msg.id })
      expect(await removed).toBe(msg.id)
      await delay(150)
      const row = await prisma.chat_messages.findUnique({ where: { id: msg.id } })
      expect(row?.deleted_at).not.toBeNull()
      await closeSock(a)
    } finally {
      await cleanupChat(chat.id)
    }
  })

  it('message:delete не-владельцем агентом → отклонено (message:removed не приходит)', async () => {
    const chat = await makeChat()
    try {
      const msg = await prisma.chat_messages.create({
        data: { chat_id: chat.id, sender_id: empA.id, sender_name: 'A', text: 'to-delete-nonowner' },
      })
      const b = connect(makeToken(empB.id))
      const a = connect(makeToken(empA.id))
      await waitForConnect(b)
      await waitForConnect(a)
      a.emit('join:chat', chat.id)
      b.emit('join:chat', chat.id)
      await delay(50)
      const noRemoved = assertNoEvent(a, 'message:removed')
      b.emit('message:delete', { chatId: chat.id, msgId: msg.id })
      await noRemoved
      await delay(100)
      const row = await prisma.chat_messages.findUnique({ where: { id: msg.id } })
      expect(row?.deleted_at).toBeNull()
      await Promise.all([closeSock(a), closeSock(b)])
    } finally {
      await cleanupChat(chat.id)
    }
  })

  it('message:delete несуществующего сообщения → игнорируется', async () => {
    const a = connect(makeToken(empA.id))
    const c = connect(makeToken(empC.id, 'senior_agent'))
    await waitForConnect(a)
    await waitForConnect(c)
    a.emit('join:chat', 77)
    c.emit('join:chat', 77)
    await delay(50)
    const noRemoved = assertNoEvent(a, 'message:removed')
    c.emit('message:delete', { chatId: 77, msgId: 999999 })
    await noRemoved
    await Promise.all([closeSock(a), closeSock(c)])
  })

  it('getIO() возвращает активный экземпляр сервера', () => {
    expect(socketModule.getIO()).toBe(io)
  })
})