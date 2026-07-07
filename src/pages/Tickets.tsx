import { useState, useEffect, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ArrowUpDown, Filter, Plus, MessageSquare, User, Download, FileText } from "lucide-react"
import { toast } from "sonner"
import { useSocket } from "@/context/SocketContext"
import { useTickets } from "@/context/ticket-context"
import { formatRelativeTime } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { TicketStatus, TicketPriority } from "@/types"

const PER_PAGE = 9

export default function Tickets() {
  const { t } = useTranslation()
  const statusLabels: Record<string, string> = {
    open: t("tickets.open"), in_progress: t("tickets.inProgress"), resolved: t("tickets.resolved"), closed: t("tickets.closed"),
  }
  const priorityLabels: Record<string, string> = {
    low: t("tickets.low"), medium: t("tickets.medium"), high: t("tickets.high"), critical: t("tickets.critical"),
  }
  const { tickets } = useTickets()
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket) return
    const onCreated = (ticket: any) => {
      toast.success(t("tickets.notifNewTicket"), { description: ticket.title })
    }
    const onUpdated = (data: any) => {
      toast.info(t("tickets.notifTicketUpdated"), { description: `#${data.id}` })
    }
    socket.on("ticket:created", onCreated)
    socket.on("ticket:updated", onUpdated)
    return () => {
      socket.off("ticket:created", onCreated)
      socket.off("ticket:updated", onUpdated)
    }
  }, [socket])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "all")
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get("priority") || "all")
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest")
  const [page, setPage] = useState(1)

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

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paged = filtered.slice(0, page * PER_PAGE)

  const resetPage = () => setPage(1)

  const exportCSV = () => {
    const headers = [t("tickets.csvHeaderId"), t("tickets.csvHeaderTitle"), t("tickets.csvHeaderStatus"), t("tickets.csvHeaderPriority"), t("tickets.csvHeaderCategory"), t("tickets.csvHeaderAssignee"), t("tickets.csvHeaderCreated")]
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

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    doc.setFontSize(16)
    doc.text(t("tickets.title"), pageW / 2, 15, { align: "center" })
    doc.setFontSize(8)
    doc.text(`Сгенерировано: ${new Date().toLocaleString()}`, pageW / 2, 21, { align: "center" })
    let y = 28
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text([t("tickets.csvHeaderId"), t("tickets.csvHeaderTitle"), t("tickets.csvHeaderStatus"), t("tickets.csvHeaderPriority"), t("tickets.csvHeaderCategory"), t("tickets.csvHeaderAssignee")], 8, y)
    y += 5
    doc.setFont("helvetica", "normal")
    filtered.forEach((t, i) => {
      if (y > 275) { doc.addPage(); y = 15 }
      doc.text([
        String(t.id),
        t.title.substring(0, 40),
        statusLabels[t.status] || t.status,
        priorityLabels[t.priority] || t.priority,
        t.category,
        t.assignedTo?.name || "—",
      ], 8, y)
      y += (i % 2 === 0 ? 4.5 : 5)
    })
    doc.save(`tickets-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Тикеты</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tickets.total", { count: filtered.length })}</p>
        </div>
        <Button onClick={() => navigate("/tickets/new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t("tickets.new")}
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
              placeholder={t("tickets.search")}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); resetPage() }}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <Filter className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tickets.allStatuses")}</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={v => { setPriorityFilter(v); resetPage() }}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tickets.allPriorities")}</SelectItem>
              {Object.entries(priorityLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => { setSortBy(s => s === "newest" ? "oldest" : "newest"); resetPage() }} aria-label="Сортировка">
            <ArrowUpDown className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />{t("tickets.exportCSV")}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportPDF}>
            <FileText className="w-4 h-4" />{t("tickets.exportPDF")}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {paged.map(ticket => (
          <div
            key={ticket.id}
            onClick={() => navigate(`/tickets/${ticket.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/tickets/${ticket.id}`) } }}
            className="bg-white rounded-xl border p-5 hover:shadow-md transition-all cursor-pointer flex flex-col"
          >
            <div className="flex items-center gap-2 mb-3">
              <Badge className={`text-[9px] ${ticket.status.replace('_', '-')}`}>
                {statusLabels[ticket.status] || ticket.status}
              </Badge>
              <Badge className={`text-[9px] priority-${ticket.priority}`}>
                {priorityLabels[ticket.priority] || ticket.priority}
              </Badge>
            </div>
            <h3 className="font-bold text-sm leading-snug mb-1 line-clamp-2">{ticket.title}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">{ticket.description}</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-3 border-t">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {ticket.createdBy.name}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {ticket.messages.length}
              </span>
              <span className="ml-auto">{formatRelativeTime(ticket.updatedAt)}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <p className="font-bold text-sm">{t("tickets.notFound")}</p>
            <p className="text-xs mt-1">{t("tickets.tryAdjust")}</p>
          </div>
        )}
      </div>

      {totalPages > 1 && page < totalPages && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setPage(p => p + 1)}>
            {t("tickets.showMore")}
          </Button>
        </div>
      )}
    </div>
  )
}
