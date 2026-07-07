import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, MessageCircle, Users, Hash, Loader2 } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils"
import type { ChatRoom } from "@/types"
import { useAuth } from "@/context/AuthContext"

const API = "http://localhost:4000/api"

function mapChatRoom(raw: any): ChatRoom {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    lastMessage: raw.last_message || undefined,
    lastTime: raw.last_time || undefined,
    unread: raw.unread || 0,
    members: raw.member_count || undefined,
  }
}

export default function ChatsPage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [chats, setChats] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch(`${API}/chats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setChats(data.map(mapChatRoom)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const groups = chats.filter(c => c.type === "group" || c.type === "channel")
  const personal = chats.filter(c => c.type === "personal")

  const filterChats = (items: ChatRoom[]) => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(c => c.name.toLowerCase().includes(q) || (c.lastMessage || "").toLowerCase().includes(q))
  }

  const filteredGroups = filterChats(groups)
  const filteredPersonal = filterChats(personal)

  const sortByTime = (a: ChatRoom, b: ChatRoom) => {
    return (b.lastTime || "").localeCompare(a.lastTime || "") || b.unread - a.unread
  }

  const chatIcon = (c: ChatRoom) => {
    if (c.type === "personal") return <Avatar className="w-10 h-10"><AvatarFallback className="bg-primary/10 text-primary text-xs">{c.name.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
    if (c.type === "channel") return <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Hash className="w-5 h-5 text-amber-600" /></div>
    return <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
  }

  const renderChat = (c: ChatRoom) => (
    <div
      key={c.id}
      onClick={() => navigate(`/chats/${c.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/chats/${c.id}`) } }}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-all group"
    >
      {chatIcon(c)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm truncate">{c.name}</h4>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
            {c.lastTime ? formatRelativeTime(c.lastTime) : ""}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{c.lastMessage || t("chats.noMessages")}</p>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {c.members && <span className="text-[9px] text-muted-foreground">{c.members}</span>}
            {c.unread > 0 && (
              <Badge className="h-5 min-w-[18px] px-1.5 bg-primary text-primary-foreground border-0 text-[9px] font-bold flex items-center justify-center rounded-full">
                {c.unread}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary" />
          {t("chats.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Общение и коммуникация</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("chats.searchPlaceholder")}
          className="pl-9"
          aria-label={t("chats.searchPlaceholder")}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <div className="space-y-1">
        {filteredGroups.length > 0 && (
          <div>
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2">
              {t("chats.general")} — {filteredGroups.length}
            </h3>
            <div className="space-y-0.5">
              {filteredGroups.sort(sortByTime).map(renderChat)}
            </div>
          </div>
        )}

        {filteredPersonal.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2">
              {t("chats.personal")} — {filteredPersonal.length}
            </h3>
            <div className="space-y-0.5">
              {filteredPersonal.sort(sortByTime).map(renderChat)}
            </div>
          </div>
        )}

        {filteredGroups.length === 0 && filteredPersonal.length === 0 && (
          <div className="text-center py-16 text-muted-foreground" role="status">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">{t("common.noResults")}</p>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
