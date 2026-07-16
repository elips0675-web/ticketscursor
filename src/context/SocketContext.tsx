import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'

interface SocketContextType {
  socket: Socket | null
  connected: boolean
  sendMessage: (chatId: number, text: string) => void
  deleteMessage: (chatId: number, msgId: number) => void
  joinChat: (chatId: number) => void
  leaveChat: (chatId: number) => void
  notifyAll: (data: { title: string; body: string; url?: string }) => void
  sendTyping: (chatId: number) => void
  markRead: (chatId: number) => void
}

export const SocketContext = createContext<SocketContextType | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!token) return
    const s = io({ auth: { token } })
    s.on('connect', () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s)
    return () => {
      s.close()
      setSocket(null)
      setConnected(false)
    }
  }, [token])

  const sendMessage = useCallback(
    (chatId: number, text: string) => {
      socket?.emit('message:send', { chatId, text })
    },
    [socket],
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
    (chatId: number) => {
      socket?.emit('message:read', { chatId })
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
