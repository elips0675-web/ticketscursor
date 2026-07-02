import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Ticket, Clock, CheckCircle2, AlertTriangle, TrendingUp, Users, BarChart3, Shield, UserCog, User } from "lucide-react"
import { useTickets } from "@/context/ticket-context"
import { useNavigate } from "react-router-dom"
import { formatRelativeTime, cn } from "@/lib/utils"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

const statusConfig = {
  open: { label: "Открытые", color: "text-blue-600", bg: "bg-blue-50" },
  in_progress: { label: "В работе", color: "text-amber-600", bg: "bg-amber-50" },
  resolved: { label: "Решённые", color: "text-green-600", bg: "bg-green-50" },
  closed: { label: "Закрытые", color: "text-gray-600", bg: "bg-gray-50" },
}

export default function Dashboard() {
  const { tickets, employees, stats } = useTickets()
  const navigate = useNavigate()

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress')
  const recentTickets = [...tickets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5)

  const chartData = [
    { name: "Открытые", value: stats.open },
    { name: "В работе", value: stats.inProgress },
    { name: "Решённые", value: stats.resolved },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
        <p className="text-sm text-muted-foreground mt-1">Общая статистика системы тикетов</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/tickets')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-blue-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">всего</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Всего тикетов</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/tickets?status=open')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">открытые</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.open + stats.inProgress}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Активные</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/tickets?priority=critical')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">критично</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.critical}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Критических</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/tickets?status=resolved')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <Badge variant="secondary" className="text-[10px]">сегодня</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.resolved}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Решённых</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-lg">Сотрудники онлайн</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {employees.filter(e => e.online).slice(0, 8).map(emp => (
            <div key={emp.id} onClick={() => navigate('/employees')} className="flex items-center gap-3 bg-card border rounded-lg px-4 py-2.5 cursor-pointer hover:shadow-sm transition-shadow">
              <div className="relative">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {emp.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
              </div>
              <div>
                <p className="text-sm font-bold">{emp.name}</p>
                <p className="text-[10px] text-muted-foreground">{emp.department}</p>
              </div>
            </div>
          ))}
          {employees.filter(e => e.online).length === 0 && (
            <p className="text-sm text-muted-foreground">Нет сотрудников онлайн</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Статистика по статусам
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
              Последние обновления
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentTickets.map(ticket => (
                <div
                  key={ticket.id}
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
