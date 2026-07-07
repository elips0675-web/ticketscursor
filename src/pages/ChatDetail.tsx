import { useState, useRef, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Send, Smile, Users, CheckCheck, Trash2, Search, ImagePlus, X } from "lucide-react"
import { cn, formatTime } from "@/lib/utils"
import type { ChatRoom, ChatMessage } from "@/types"
import { motion, AnimatePresence } from "framer-motion"
import { useSocket } from "@/context/SocketContext"
import { useAuth } from "@/context/AuthContext"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

const CHAT_INFO: Record<number, { name: string; type: string }> = {
  1: { name: "Общий чат", type: "group" },
  2: { name: "Разработка", type: "group" },
  3: { name: "IT-поддержка", type: "channel" },
  4: { name: "HR — важное", type: "group" },
  5: { name: "Алексей Петров", type: "personal" },
  6: { name: "Мария Иванова", type: "personal" },
  7: { name: "Дмитрий Сидоров", type: "personal" },
  8: { name: "Елена Козлова", type: "personal" },
  9: { name: "Проект Альфа", type: "group" },
  10: { name: "Бухгалтерия", type: "channel" },
}

const SEED_MESSAGES: Record<number, ChatMessage[]> = {
  1: [
    { id: 1, chatId: 1, senderId: 1, senderName: "Алексей Петров", text: "Коллеги, напоминаю о собрании в 15:00", createdAt: "2026-07-02T14:00:00" },
    { id: 2, chatId: 1, senderId: 2, senderName: "Мария Иванова", text: "Принято, буду", createdAt: "2026-07-02T14:05:00" },
    { id: 3, chatId: 1, senderId: 3, senderName: "Дмитрий Сидоров", text: "Ок", createdAt: "2026-07-02T14:10:00" },
    { id: 4, chatId: 1, senderId: 1, senderName: "Алексей Петров", text: "Обновите статусы по тикетам до собрания", createdAt: "2026-07-02T14:20:00", reactions: { "👍": [2, 3] } },
    { id: 5, chatId: 1, senderId: 2, senderName: "Мария Иванова", text: "Вопрос: кто будет делать презентацию?", createdAt: "2026-07-02T14:30:00" },
  ],
  5: [
    { id: 10, chatId: 5, senderId: 1, senderName: "Я", text: "Привет! Сделаешь отчёт до пятницы?", createdAt: "2026-07-02T14:00:00" },
    { id: 11, chatId: 5, senderId: 5, senderName: "Алексей Петров", text: "Да, без проблем", createdAt: "2026-07-02T14:30:00" },
    { id: 12, chatId: 5, senderId: 1, senderName: "Я", text: "Отлично, скинь в общий чат", createdAt: "2026-07-02T14:35:00" },
    { id: 13, chatId: 5, senderId: 5, senderName: "Алексей Петров", text: "Ок, сделаю до вечера", createdAt: "2026-07-02T15:00:00" },
  ],
}

export default function ChatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const chatId = Number(id)
  const { sendMessage, deleteMessage, joinChat, leaveChat, socket } = useSocket()
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES[chatId] || [])
  const [input, setInput] = useState("")
  const [showReactions, setShowReactions] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [imageFile, setImageFile] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)

  const chatInfo = CHAT_INFO[chatId] || { name: "Чат", type: "personal" }

  useEffect(() => { joinChat(chatId); return () => leaveChat(chatId) }, [chatId])

  useEffect(() => {
    if (!socket) return
    const onNew = (msg: ChatMessage) => setMessages(prev => [...prev, msg])
    const onRemove = (msgId: number) => setMessages(prev => prev.filter(m => m.id !== msgId))
    socket.on("message:new", onNew)
    socket.on("message:removed", onRemove)
    return () => { socket.off("message:new", onNew); socket.off("message:removed", onRemove) }
  }, [socket])

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const send = () => {
    if (!input.trim() && !imageFile) return
    const msg: Partial<ChatMessage> = {
      id: Date.now(),
      chatId,
      senderId: currentUserId,
      senderName: "Я",
      text: input.trim(),
      image: imageFile || undefined,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, msg as ChatMessage])
    setInput("")
    setImageFile(null)
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
  }

  const pickImage = () => fileInputRef.current?.click()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageFile(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const toggleReaction = (msgId: number, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const r = { ...(m.reactions || {}) }
      const list = r[emoji] || []
      if (list.includes(0)) {
        const filtered = list.filter(x => x !== 0)
        if (filtered.length) r[emoji] = filtered
        else delete r[emoji]
      } else {
        r[emoji] = [...list, 0]
      }
      return { ...m, reactions: Object.keys(r).length ? r : undefined }
    }))
    setShowReactions(null)
  }

  const delMsg = (msgId: number) => {
    deleteMessage(chatId, msgId)
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  const filteredMsgs = messages.filter(m =>
    !searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isGroup = chatInfo.type === "group" || chatInfo.type === "channel"
  const currentUserId = user?.id ?? 0

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/chats")} className="rounded-full" aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          {isGroup ? <Users className="w-5 h-5 text-primary" /> : <Avatar className="w-10 h-10"><AvatarFallback className="text-xs bg-primary/10 text-primary">{chatInfo.name[0]}</AvatarFallback></Avatar>}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate">{chatInfo.name}</h2>
          <p className="text-[10px] text-muted-foreground">{isGroup ? "Групповой чат" : "Личный чат"}</p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowSearch(!showSearch)} aria-label="Поиск по чату">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {showSearch && (
        <div className="mb-3">
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск в чате..." className="text-sm" autoFocus />
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ scrollBehavior: "smooth" }}>
        <AnimatePresence initial={false}>
          {filteredMsgs.map(msg => {
            const isMe = msg.senderId === currentUserId || msg.senderName === "Я"
            const msgReactions = msg.reactions
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={cn("flex", isMe ? "justify-end" : "justify-start")}
              >
                <div className={cn("max-w-[75%] group", isMe ? "items-end" : "items-start")}>
                  {!isMe && isGroup && (
                    <p className="text-[10px] font-bold text-muted-foreground mb-1 ml-1">{msg.senderName}</p>
                  )}
                  <div className={cn(
                    "relative px-3 py-2 rounded-xl text-sm shadow-sm overflow-hidden",
                    isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md",
                  )}>
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt=""
                        onClick={() => setPreviewImg(msg.image!)}
                        className="max-w-full max-h-60 rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity object-cover"
                      />
                    )}
                    {msg.text && <p className="leading-snug">{msg.text}</p>}
                    <div className={cn("flex items-center gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
                      <span className="text-[9px] opacity-60">{formatTime(msg.createdAt)}</span>
                      {isMe && <CheckCheck className="w-3 h-3 opacity-60" />}
                    </div>
                  </div>

                  {msgReactions && Object.keys(msgReactions).length > 0 && (
                    <div className={cn("flex gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
                      {Object.entries(msgReactions).map(([emoji, users]) => (
                        <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border text-muted-foreground hover:bg-muted/50 transition-all",
                            users.includes(0) && "bg-primary/10 border-primary/30 text-primary",
                          )}
                        >
                          {emoji} <span className="text-[9px] font-bold">{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={cn(
                    "absolute -top-6 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex",
                    isMe ? "right-0" : "left-0",
                  )}>
                    <div className="relative">
                      <button onClick={() => setShowReactions(showReactions === msg.id ? null : msg.id)}
                        className="p-1 hover:bg-muted rounded-full text-muted-foreground"
                      >
                        <Smile className="w-3 h-3" />
                      </button>
                      {showReactions === msg.id && (
                        <div className={cn(
                          "absolute bottom-full mb-1 flex gap-0.5 p-1 bg-popover border rounded-xl shadow-lg z-10",
                          isMe ? "right-0" : "left-0",
                        )}>
                          {QUICK_REACTIONS.map(emoji => (
                            <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                              className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded-lg text-sm transition-all active:scale-90"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isMe && (
                      <button onClick={() => delMsg(msg.id)} className="p-1 hover:bg-muted rounded-full text-muted-foreground" aria-label="Удалить">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <div ref={msgEndRef} />
      </div>

      <div className="space-y-2 pt-3 border-t mt-3">
        {imageFile && (
          <div className="relative inline-block rounded-lg overflow-hidden border">
            <img src={imageFile} alt="" className="max-h-24 object-cover" />
            <button onClick={() => setImageFile(null)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors" aria-label="Удалить"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") send() }}
            placeholder="Написать сообщение..." className="flex-1 h-10 text-sm"
          />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button variant="ghost" size="icon" onClick={pickImage} className="h-10 w-10 rounded-xl shrink-0 text-muted-foreground hover:text-foreground" title="Прикрепить изображение" aria-label="Прикрепить изображение">
            <ImagePlus className="w-4 h-4" />
          </Button>
          <Button size="icon" onClick={send} disabled={!input.trim() && !imageFile} className="h-10 w-10 rounded-xl shrink-0" aria-label="Отправить">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {previewImg && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
            <button onClick={() => setPreviewImg(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="Закрыть"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          </div>
        )}
      </div>
    </div>
  )
}