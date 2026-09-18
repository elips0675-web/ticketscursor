import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'

const OUTBOX_KEY = 'socket_offline_outbox'

interface OutboxEntry {
  clientId: string
  chatId: number
  text: string
  createdAt: string
}

function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOutbox(entries: OutboxEntry[]) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries))
  } catch {
    /* storage unavailable */
  }
}

interface SocketContextType {
  socket: Socket | null
  connected: boolean
  sendMessage: (chatId: number, text: string, clientId?: string) => void
  deleteMessage: (chatId: number, msgId: number) => void
  joinChat: (chatId: number) => void
  leaveChat: (chatId: number) => void
  notifyAll: (data: { title: string; body: string; url?: string }) => void
  sendTyping: (chatId: number) => void
  markRead: (chatId: number, lastReadMessageId?: number) => void
}

export const SocketContext = createContext<SocketContextType | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [socketState, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const socket = token ? socketState : null

  useEffect(() => {
    if (!token) return
    writeOutbox([])
    const s = io({ auth: { token } })
    const flushOutbox = () => {
      const entries = readOutbox()
      for (const e of entries) {
        s.emit('message:send', { chatId: e.chatId, text: e.text, clientId: e.clientId })
      }
    }
    s.on('connect', () => {
      setConnected(true)
      flushOutbox()
    })
    s.on('disconnect', () => setConnected(false))
    s.on('message:ack', ({ clientId }: { clientId?: string }) => {
      if (!clientId) return
      writeOutbox(readOutbox().filter((e) => e.clientId !== clientId))
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s)
    return () => {
      s.close()
      setSocket(null)
      setConnected(false)
    }
  }, [token])

  const sendMessage = useCallback(
    (chatId: number, text: string, clientId?: string) => {
      const id = clientId || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      if (connected && socket) {
        socket.emit('message:send', { chatId, text, clientId: id })
      } else {
        writeOutbox([...readOutbox(), { clientId: id, chatId, text, createdAt: new Date().toISOString() }])
      }
    },
    [connected, socket],
  )

  const deleteMessage = useCallback(
    (chatId: number, msgId: number) => {
      socket?.emit('message:delete', { chatId, msgId })
    },
    [socket],
  )

  const joinChat = useCallback(
    (chatId: number) => {
      socket?.emit('join:chat', chatId)
    },
    [socket],
  )

  const leaveChat = useCallback(
    (chatId: number) => {
      socket?.emit('leave:chat', chatId)
    },
    [socket],
  )

  const notifyAll = useCallback(
    (data: { title: string; body: string; url?: string }) => {
      socket?.emit('notify:all', data)
    },
    [socket],
  )

  const sendTyping = useCallback(
    (chatId: number) => {
      socket?.emit('chat:typing', { chatId })
    },
    [socket],
  )

  const markRead = useCallback(
    (chatId: number, lastReadMessageId?: number) => {
      socket?.emit('message:read', { chatId, lastReadMessageId })
    },
    [socket],
  )

  return (
    <SocketContext.Provider
      value={{ socket, connected, sendMessage, deleteMessage, joinChat, leaveChat, notifyAll, sendTyping, markRead }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
