import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Ticket, Clock, CheckCircle2, AlertTriangle, TrendingUp, Users, BarChart3 } from "lucide-react"
import { useTickets } from "@/context/ticket-context"
import { useNavigate } from "react-router-dom"
import { formatRelativeTime } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

export default function Dashboard() {
  const { tickets, employees, stats } = useTickets()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const statusConfig = {
    open: { label: t("tickets.open"), color: "text-blue-600", bg: "bg-blue-50" },
    in_progress: { label: t("tickets.inProgress"), color: "text-amber-600", bg: "bg-amber-50" },
    resolved: { label: t("tickets.resolved"), color: "text-green-600", bg: "bg-green-50" },
    closed: { label: t("tickets.closed"), color: "text-gray-600", bg: "bg-gray-50" },
  }

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress')
  const recentTickets = [...tickets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5)

  const chartData = [
    { name: t("dashboard.open"), value: stats.open },
    { name: t("dashboard.inProgress"), value: stats.inProgress },
    { name: t("dashboard.resolved"), value: stats.resolved },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/tickets') } }} onClick={() => navigate('/tickets')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-blue-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{t("dashboard.total")}</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("dashboard.totalTickets")}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/tickets?status=open') } }} onClick={() => navigate('/tickets?status=open')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{t("dashboard.open")}</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.open + stats.inProgress}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("dashboard.active")}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/tickets?priority=critical') } }} onClick={() => navigate('/tickets?priority=critical')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{t("dashboard.critical")}</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.critical}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("dashboard.criticalCount")}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/tickets?status=resolved') } }} onClick={() => navigate('/tickets?status=resolved')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{t("dashboard.resolved")}</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.resolved}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("dashboard.resolvedToday")}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">{t("dashboard.employees")}</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/employees')}>
            {t("dashboard.allEmployees")}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {employees.slice(0, 6).map(emp => (
            <div key={emp.id} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/employees') } }} onClick={() => navigate('/employees')} className="flex items-center gap-3 bg-card border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow">
              <div className="relative">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="text-sm bg-primary/10 text-primary">
                    {emp.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                {emp.online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{emp.name}</p>
                <p className="text-[10px] text-muted-foreground">{emp.department}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {emp.online ? (
                    <span className="text-[9px] text-green-600 font-medium">{t("employees.online")}</span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">{t("employees.offline")}</span>
                  )}
                  <span className="text-[9px] text-muted-foreground">{t("employees.activeTickets", { count: emp.activeTickets })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              {t("dashboard.byStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => (
                      <rect key={i} fill={["#3b82f6", "#f59e0b", "#10b981"][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              {t("dashboard.recentUpdates")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentTickets.map(ticket => (
                <div
                  key={ticket.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/tickets/${ticket.id}`) } }}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{ticket.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`text-[9px] ${ticket.status.replace('_', '-')}`}>
                        {statusConfig[ticket.status]?.label || ticket.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(ticket.updatedAt)}</span>
                    </div>
                  </div>
                  {ticket.assignedTo && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {ticket.assignedTo.name.split(' ')[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
