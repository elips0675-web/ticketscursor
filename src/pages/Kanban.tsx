import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Columns3, Plus, MessageSquare, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTickets } from "@/context/ticket-context"
import type { Ticket, TicketStatus } from "@/types"

const COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: "open", label: "Открытые", color: "border-t-blue-500" },
  { key: "in_progress", label: "В работе", color: "border-t-amber-500" },
  { key: "resolved", label: "Решённые", color: "border-t-emerald-500" },
  { key: "closed", label: "Закрытые", color: "border-t-slate-500" },
]

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  low: "bg-slate-500/10 text-slate-500 border-slate-500/20",
}

export default function KanbanPage() {
  const { tickets, updateTicketStatus } = useTickets()
  const navigate = useNavigate()
  const [dragId, setDragId] = useState<number | null>(null)

  const grouped = COLUMNS.map(col => ({
    ...col,
    tickets: tickets.filter(t => t.status === col.key),
  }))

  const handleDragStart = (e: React.DragEvent, ticketId: number) => {
    setDragId(ticketId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(ticketId))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (e: React.DragEvent, status: TicketStatus) => {
    e.preventDefault()
    const id = Number(e.dataTransfer.getData("text/plain"))
    if (id) updateTicketStatus(id, status)
    setDragId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Columns3 className="w-6 h-6 text-primary" />
            Канбан-доска
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Перетаскивайте тикеты между статусами</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {grouped.map(col => (
          <div
            key={col.key}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, col.key)}
            className={cn(
              "rounded-xl border bg-card/50 min-h-[300px] flex flex-col",
              col.color,
              dragId && "border-dashed",
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-sm">{col.label}</h3>
              <Badge variant="secondary" className="text-[10px]">{col.tickets.length}</Badge>
            </div>
            <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-18rem)]">
              {col.tickets.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-xs">Нет тикетов</p>
                </div>
              )}
              {col.tickets.map(ticket => (
                <div
                  key={ticket.id}
                  draggable
                  onDragStart={e => handleDragStart(e, ticket.id)}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/tickets/${ticket.id}`); } }}
                  role="button"
                  tabIndex={0}
                  className="rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all space-y-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold leading-snug line-clamp-2">{ticket.title}</h4>
                    <Badge className={cn("text-[9px] border shrink-0", PRIORITY_COLORS[ticket.priority])}>
                      {ticket.priority === "critical" ? "Крит." : ticket.priority === "high" ? "Выс." : ticket.priority === "medium" ? "Сред." : "Низк."}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{ticket.description}</p>
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {ticket.messages_count ?? ticket.messages.length}
                      </span>
                      {ticket.assignedTo && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ticket.assignedTo.name.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
