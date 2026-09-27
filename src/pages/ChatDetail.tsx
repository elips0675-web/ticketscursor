import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ArrowLeft,
  Send,
  Smile,
  Users,
  CheckCheck,
  Trash2,
  Search,
  ImagePlus,
  X,
  Loader2,
  Pencil,
  Check,
  Reply,
} from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ChatMessage, ChatReadReceipt } from '@/types'
import { motion } from 'framer-motion'
import { useSocket } from '@/context/SocketContext'
import { useAuth } from '@/context/AuthContext'
import { useFeature } from '@/hooks/useFeature'
import { useTranslation } from 'react-i18next'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export default function ChatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const chatId = Number(id)
  const { sendMessage, deleteMessage, editMessage, joinChat, leaveChat, socket, connected, sendTyping, markRead } =
    useSocket()
  const { user } = useAuth()
  const { t } = useTranslation()
  const editEnabled = useFeature('chat_message_edit')
  const replyEnabled = useFeature('chat_reply_to')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInfo, setChatInfo] = useState<{ name: string; type: string }>({ name: 'Чат', type: 'personal' })
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [replyTo, setReplyTo] = useState<Pick<ChatMessage, 'id' | 'senderName' | 'text'> | null>(null)
  const [showReactions, setShowReactions] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [imageFile, setImageFile] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<number[]>([])
  const [readers, setReaders] = useState<ChatReadReceipt[]>([])
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const mapMessage = (m: Record<string, unknown>): ChatMessage => ({
    id: m.id as number,
    chatId: (m.chatId ?? m.chat_id) as number,
    senderId: (m.senderId ?? m.sender_id) as number,
    senderName: (m.senderName ?? m.sender_name ?? '') as string,
    text: m.text as string,
    image: m.image as string | undefined,
    createdAt: (m.createdAt ?? m.created_at) as string,
    edited: Boolean(m.edited_at ?? m.edited),
    reactions: m.reactions as Record<string, number[]> | undefined,
    replyTo: m.reply_to
      ? {
          id: (m.reply_to as Record<string, unknown>).id as number,
          senderName: ((m.reply_to as Record<string, unknown>).sender_name ?? '') as string,
          text: ((m.reply_to as Record<string, unknown>).text ?? '') as string,
        }
      : undefined,
  })

  useEffect(() => {
    if (!chatId) return
    setLoading(true)
    api
      .get(`/chats/${chatId}`)
      .then((data) => {
        if (data) {
          setChatInfo({ name: data.name, type: data.type })
          const msgs = (data.messages || []).map(mapMessage)
          setMessages(msgs)
          if (Array.isArray(data.readers)) setReaders(data.readers)
          const latestId = msgs.reduce((max, m) => Math.max(max, m.id), 0)
          if (latestId > 0) {
            markRead(chatId, latestId)
            api.put(`/chats/${chatId}/read`, { lastReadMessageId: latestId }).catch(() => {})
          }
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  useEffect(() => {
    joinChat(chatId)
    return () => {
      leaveChat(chatId)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [chatId, joinChat, leaveChat])

  useEffect(() => {
    if (!socket) return
    const onNew = (msg: Record<string, unknown>) => {
      const mapped = mapMessage(msg)
      setMessages((prev) => {
        if (mapped.senderId === currentUserId) {
          const idx = prev.findIndex(
            (m) =>
              m.id !== mapped.id && m.senderId === mapped.senderId && m.senderName === 'Я' && m.text === mapped.text,
          )
          if (idx !== -1) {
            const next = [...prev]
            next[idx] = mapped
            return next
          }
        }
        return [...prev, mapped]
      })
      setTypingUsers((prev) => prev.filter((id) => id !== mapped.senderId))
      if (mapped.senderId !== currentUserId) {
        markRead(chatId, mapped.id)
        api.put(`/chats/${chatId}/read`, { lastReadMessageId: mapped.id }).catch(() => {})
      }
    }
    const onRemove = (msgId: number) => setMessages((prev) => prev.filter((m) => m.id !== msgId))
    const onEdited = (msg: Record<string, unknown>) => {
      const mapped = mapMessage(msg)
      setMessages((prev) => prev.map((m) => (m.id === mapped.id ? mapped : m)))
    }
    const onTyping = ({ userId }: { userId: number }) => {
      if (userId === currentUserId) return
      setTypingUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
      setTimeout(() => setTypingUsers((prev) => prev.filter((id) => id !== userId)), 3000)
    }
    const onRead = ({
      userId,
      lastReadMessageId,
      lastReadAt,
    }: {
      userId: number
      lastReadMessageId?: number | null
      lastReadAt?: string
    }) => {
      setReaders((prev) => [
        ...prev.filter((r) => r.userId !== userId),
        { userId, lastReadMessageId: lastReadMessageId ?? null, lastReadAt: lastReadAt || new Date().toISOString() },
      ])
    }
    socket.on('message:new', onNew)
    socket.on('message:removed', onRemove)
    socket.on('message:edited', onEdited)
    socket.on('chat:typing', onTyping)
    socket.on('chat:read', onRead)
    return () => {
      socket.off('message:new', onNew)
      socket.off('message:removed', onRemove)
      socket.off('message:edited', onEdited)
      socket.off('chat:typing', onTyping)
      socket.off('chat:read', onRead)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() && !imageFile) return
    const msg: Partial<ChatMessage> = {
      id: Date.now(),
      chatId,
      senderId: currentUserId,
      senderName: 'Я',
      text: input.trim(),
      image: imageFile || undefined,
      createdAt: new Date().toISOString(),
      replyTo: replyTo || undefined,
    }
    setMessages((prev) => [...prev, msg as ChatMessage])
    if (input.trim()) {
      if (connected) {
        sendMessage(chatId, input.trim(), undefined, replyTo?.id)
      } else {
        try {
          await api.post(`/chats/${chatId}/messages`, { text: input.trim(), replyToId: replyTo?.id })
        } catch {
          /* ignore */
        }
      }
    }
    setInput('')
    setImageFile(null)
    setReplyTo(null)
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const pickImage = () => fileInputRef.current?.click()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageFile(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const toggleReaction = (msgId: number, emoji: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m
        const r = { ...(m.reactions || {}) }
        const list = r[emoji] || []
        if (list.includes(0)) {
          const filtered = list.filter((x) => x !== 0)
          if (filtered.length) r[emoji] = filtered
          else delete r[emoji]
        } else {
          r[emoji] = [...list, 0]
        }
        return { ...m, reactions: Object.keys(r).length ? r : undefined }
      }),
    )
    setShowReactions(null)
  }

  const delMsg = (msgId: number) => {
    deleteMessage(chatId, msgId)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  // Этап 65 (подзадача 2): редактирование сообщения (флаг chat_message_edit)
  const startEdit = (msg: ChatMessage) => {
    setEditingMsgId(msg.id)
    setEditText(msg.text)
  }

  const saveEdit = async () => {
    if (!editText.trim() || editingMsgId === null) return
    const id = editingMsgId
    const trimmed = editText.trim()
    if (connected) {
      editMessage(chatId, id, trimmed)
    } else {
      try {
        await api.put(`/chats/${chatId}/messages/${id}`, { text: trimmed })
      } catch {
        /* ignore */
      }
    }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: trimmed, edited: true } : m)))
    setEditingMsgId(null)
    setEditText('')
  }

  const filteredMsgs = messages.filter((m) => !searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase()))

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredMsgs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  useEffect(() => {
    if (virtualizer.getTotalSize() > 0) {
      virtualizer.scrollToIndex(filteredMsgs.length - 1, { align: 'end' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMsgs.length])

  const isGroup = chatInfo.type === 'group' || chatInfo.type === 'channel'
  const currentUserId = user?.id ?? 0

  const readersOf = (msgId: number): ChatReadReceipt[] =>
    readers.filter((r) => r.userId !== currentUserId && r.lastReadMessageId !== null && r.lastReadMessageId >= msgId)

  const renderMsg = (msg: ChatMessage) => {
    const isMe = msg.senderId === currentUserId || msg.senderName === 'Я'
    const msgReactions = msg.reactions
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
      >
        <div className={cn('max-w-[75%] group', isMe ? 'items-end' : 'items-start')}>
          {!isMe && isGroup && (
            <p className="text-[10px] font-bold text-muted-foreground mb-1 ml-1">{msg.senderName}</p>
          )}
          <div
            className={cn(
              'relative px-3 py-2 rounded-xl text-sm shadow-sm overflow-hidden',
              isMe ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border rounded-bl-md',
            )}
          >
            {msg.image && (
              <img
                src={msg.image}
                alt=""
                onClick={() => setPreviewImg(msg.image!)}
                className="max-w-full max-h-60 rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity object-cover"
              />
            )}
            {msg.replyTo && (
              <div
                className={cn(
                  'mb-1.5 px-2 py-1 rounded-md text-[11px] border-l-2 overflow-hidden',
                  isMe ? 'bg-primary-foreground/10 border-primary-foreground/40' : 'bg-muted/60 border-primary/40',
                )}
              >
                <span className="block font-semibold opacity-80 truncate">{msg.replyTo.senderName}</span>
                <span className="block opacity-70 truncate">{msg.replyTo.text}</span>
              </div>
            )}
            {msg.text && <p className="leading-snug">{msg.text}</p>}
            <div className={cn('flex items-center gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
              {msg.edited && <span className="text-[9px] opacity-60">{t('chat.edited')}</span>}
              <span className="text-[9px] opacity-60">{formatTime(msg.createdAt)}</span>
              {isMe && (
                <span
                  title={readersOf(msg.id).length > 0 ? 'Прочитано' : 'Доставлено'}
                  aria-label={readersOf(msg.id).length > 0 ? 'Прочитано' : 'Доставлено'}
                >
                  <CheckCheck
                    className={cn(
                      'w-3 h-3 transition-colors',
                      readersOf(msg.id).length > 0 ? 'text-blue-400' : 'opacity-60',
                    )}
                  />
                </span>
              )}
            </div>
          </div>

          {msgReactions && Object.keys(msgReactions).length > 0 && (
            <div className={cn('flex gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
              {Object.entries(msgReactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(msg.id, emoji)}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border text-muted-foreground hover:bg-muted/50 transition-all',
                    users.includes(0) && 'bg-primary/10 border-primary/30 text-primary',
                  )}
                >
                  {emoji} <span className="text-[9px] font-bold">{users.length}</span>
                </button>
              ))}
            </div>
          )}

          <div
            className={cn(
              'absolute -top-6 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex',
              isMe ? 'right-0' : 'left-0',
            )}
          >
            <div className="relative">
              <button
                onClick={() => setShowReactions(showReactions === msg.id ? null : msg.id)}
                className="p-1 hover:bg-muted rounded-full text-muted-foreground"
              >
                <Smile className="w-3 h-3" />
              </button>
              {showReactions === msg.id && (
                <div
                  className={cn(
                    'absolute bottom-full mb-1 flex gap-0.5 p-1 bg-popover border rounded-xl shadow-lg z-10',
                    isMe ? 'right-0' : 'left-0',
                  )}
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(msg.id, emoji)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded-lg text-sm transition-all active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isMe && (
              <button
                onClick={() => delMsg(msg.id)}
                className="p-1 hover:bg-muted rounded-full text-muted-foreground"
                aria-label="Удалить"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            {isMe && editEnabled && (
              <button
                onClick={() => startEdit(msg)}
                className="p-1 hover:bg-muted rounded-full text-muted-foreground"
                aria-label={t('chat.editMessage')}
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {replyEnabled && (
              <button
                onClick={() => {
                  setReplyTo({ id: msg.id, senderName: msg.senderName || 'User', text: msg.text })
                  if (editingMsgId !== null) setEditingMsgId(null)
                }}
                className="p-1 hover:bg-muted rounded-full text-muted-foreground"
                aria-label={t('chat.reply')}
              >
                <Reply className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/chats')}
          className="rounded-full"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          {isGroup ? (
            <Users className="w-5 h-5 text-primary" />
          ) : (
            <Avatar className="w-10 h-10">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{chatInfo.name[0]}</AvatarFallback>
            </Avatar>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate">{chatInfo.name}</h2>
          <p className="text-[10px] text-muted-foreground">{isGroup ? 'Групповой чат' : 'Личный чат'}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => setShowSearch(!showSearch)}
          aria-label="Поиск по чату"
        >
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {showSearch && (
        <div className="mb-3">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск в чате..."
            className="text-sm"
            autoFocus
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
          {virtualizer.getVirtualItems().length > 0 ? (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const msg = filteredMsgs[virtualItem.index]
                return (
                  <div
                    key={msg.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderMsg(msg)}
                  </div>
                )
              })}
            </div>
          ) : (
            filteredMsgs.map((msg) => (
              <div key={msg.id} className="mb-2">
                {renderMsg(msg)}
              </div>
            ))
          )}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-muted-foreground">
              <span className="flex gap-0.5">
                <span
                  className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
              Кто-то печатает...
            </div>
          )}
          <div ref={msgEndRef} />
        </div>
      )}

      <div className="space-y-2 pt-3 border-t mt-3">
        {imageFile && (
          <div className="relative inline-block rounded-lg overflow-hidden border">
            <img src={imageFile} alt="" className="max-h-24 object-cover" />
            <button
              onClick={() => setImageFile(null)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="Удалить"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        )}
        {replyTo && replyEnabled && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 text-xs">
            <Reply className="w-3 h-3 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="block font-semibold text-primary truncate">
                {t('chat.replyTo')}: {replyTo.senderName}
              </span>
              <span className="block text-muted-foreground truncate">{replyTo.text}</span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 hover:bg-muted rounded-full shrink-0"
              aria-label={t('chat.cancelReply')}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {editingMsgId !== null ? (
            <>
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                }}
                autoFocus
                placeholder={t('chat.editMessage')}
                className="flex-1 h-10 text-sm"
              />
              <Button
                size="icon"
                onClick={saveEdit}
                disabled={!editText.trim()}
                className="h-10 w-10 rounded-xl shrink-0"
                aria-label={t('chat.saveEdit')}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingMsgId(null)}
                className="h-10 w-10 rounded-xl shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t('chat.cancelEdit')}
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                  sendTyping(chatId)
                  typingTimeoutRef.current = setTimeout(() => {}, 2000)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send()
                }}
                placeholder="Написать сообщение..."
                className="flex-1 h-10 text-sm"
              />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <Button
                variant="ghost"
                size="icon"
                onClick={pickImage}
                className="h-10 w-10 rounded-xl shrink-0 text-muted-foreground hover:text-foreground"
                title="Прикрепить изображение"
                aria-label="Прикрепить изображение"
              >
                <ImagePlus className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                onClick={send}
                disabled={!input.trim() && !imageFile}
                className="h-10 w-10 rounded-xl shrink-0"
                aria-label="Отправить"
              >
                <Send className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
        {previewImg && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewImg(null)}
          >
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <img
              src={previewImg}
              alt=""
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  )
}
