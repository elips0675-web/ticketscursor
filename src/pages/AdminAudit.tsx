import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/context/AuthContext"
import { Search, Loader2, Clock, User } from "lucide-react"
import { useTranslation } from "react-i18next"

const API = "http://localhost:4000/api"

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  status_changed: "Status Changed",
  priority_changed: "Priority Changed",
  assigned: "Assigned",
}

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  status_changed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  priority_changed: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  assigned: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
}

export default function AdminAudit() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch(`${API}/admin/audit`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setLogs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const filtered = search
    ? logs.filter(l =>
        (l.user_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.action || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.details || "").toLowerCase().includes(search.toLowerCase()))
    : logs

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">History of all changes</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions..." className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold text-sm">No entries found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            let details = ""
            try { details = log.details ? JSON.stringify(JSON.parse(log.details)) : "" } catch { details = log.details || "" }
            return (
              <Card key={log.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{log.user_name}</span>
                      <Badge className={`text-[9px] ${ACTION_COLORS[log.action] || ""}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        #{log.entity_id} {log.entity_type}
                      </span>
                    </div>
                    {details && <p className="text-xs text-muted-foreground mt-1 truncate">{details}</p>}
                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
