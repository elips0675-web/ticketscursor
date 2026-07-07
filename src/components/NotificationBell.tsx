import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Bell, Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"
import { useSocket } from "@/context/SocketContext"

const API = "http://localhost:4000/api"

export default function NotificationBell() {
  const { token, user } = useAuth()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API}/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setNotifications(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!socket || !user) return
    const handler = (notif: any) => {
      setNotifications(prev => [notif, ...prev])
    }
    socket.on(`notification:${user.id}`, handler)
    return () => { socket.off(`notification:${user.id}`, handler) }
  }, [socket, user])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const markRead = async (id: number) => {
    await fetch(`${API}/notifications/${id}/read`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
  }

  const markAllRead = async () => {
    await fetch(`${API}/notifications/read-all`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
  }

  const unread = notifications.filter(n => !n.is_read).length

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)} aria-label="Уведомления">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-popover border rounded-xl shadow-xl z-50 max-h-96 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-xs font-bold">Уведомления</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[10px] text-primary hover:underline">Все прочитано</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">Нет уведомлений</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { markRead(n.id); navigate(n.link || "#"); setOpen(false) }}
                  className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-muted/30" : ""}`}
                >
                  <p className="text-xs font-bold">{n.title}</p>
                  {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{n.body}</p>}
                  <p className="text-[9px] text-muted-foreground/50 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
