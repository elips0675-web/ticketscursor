import { useState, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ArrowUpDown, Filter, Plus, ChevronRight, MessageSquare, User, Download } from "lucide-react"
import { useTickets } from "@/context/ticket-context"
import { formatRelativeTime } from "@/lib/utils"
import type { TicketStatus, TicketPriority } from "@/types"

const statusLabels: Record<string, string> = {
  open: "Открытые", in_progress: "В работе", resolved: "Решённые", closed: "Закрытые",
}
const priorityLabels: Record<string, string> = {
  low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критичный",
}

export default function Tickets() {
  const { tickets } = useTickets()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "all")
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get("priority") || "all")
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest")

  const filtered = useMemo(() => {
    let result = [...tickets]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") result = result.filter(t => t.status === statusFilter)
    if (priorityFilter !== "all") result = result.filter(t => t.priority === priorityFilter)
    result.sort((a, b) => sortBy === "newest"
      ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    return result
  }, [tickets, search, statusFilter, priorityFilter, sortBy])

  const exportCSV = () => {
    const headers = ["ID", "Название", "Статус", "Приоритет", "Категория", "Исполнитель", "Создан"]
    const rows = filtered.map(t => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      statusLabels[t.status] || t.status,
      priorityLabels[t.priority] || t.priority,
      t.category,
      t.assignedTo?.name || "",
      new Date(t.createdAt).toLocaleDateString(),
    ])
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Тикеты</h1>
          <p className="text-sm text-muted-foreground mt-1">{tickets.length} всего</p>
        </div>
        <Button onClick={() => navigate("/tickets/new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Новый тикет
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск тикетов..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <Filter className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все приоритеты</SelectItem>
              {Object.entries(priorityLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setSortBy(s => s === "newest" ? "oldest" : "newest")}>
            <ArrowUpDown className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />CSV
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.map(ticket => (
          <div
            key={ticket.id}
            onClick={() => navigate(`/tickets/${ticket.id}`)}
            className="bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-bold text-sm truncate">{ticket.title}</h3>
                  <Badge className={`text-[9px] ${ticket.status.replace('_', '-')}`}>
                    {statusLabels[ticket.status] || ticket.status}
                  </Badge>
                  <Badge className={`text-[9px] priority-${ticket.priority}`}>
                    {priorityLabels[ticket.priority] || ticket.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{ticket.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {ticket.createdBy.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {ticket.messages.length}
                  </span>
                  <span>{formatRelativeTime(ticket.updatedAt)}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-bold text-sm">Тикеты не найдены</p>
            <p className="text-xs mt-1">Попробуйте изменить параметры поиска</p>
          </div>
        )}
      </div>
    </div>
  )
}
