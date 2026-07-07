import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Shield, Users, Ticket, Activity, UserCog, ShieldCheck, RefreshCw } from "lucide-react"
import { useNavigate } from "react-router-dom"

interface Employee {
  id: number
  name: string
  email: string
  role: string
  department: string
  online: boolean
  activeTickets: number
  resolvedToday: number
  isActive: boolean
}

interface Stats {
  total: number
  open: number
  inProgress: number
  resolved: number
  critical: number
}

export default function Admin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    const token = localStorage.getItem("token")
    try {
      const [empRes, statsRes] = await Promise.all([
        fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/employees/stats", { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (empRes.ok) setEmployees(await empRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (err) {
      console.error("Admin fetch error:", err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const roleBadge = (role: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      admin: { label: t("employees.admin"), variant: "default" },
      senior_agent: { label: t("employees.seniorAgent"), variant: "secondary" },
      agent: { label: t("employees.agent"), variant: "outline" },
    }
    const c = map[role] || { label: role, variant: "outline" as const }
    return <Badge variant={c.variant} className="text-[10px]">{c.label}</Badge>
  }

  const activeEmployees = employees.filter(e => e.isActive)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.dashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin.dashboardSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {t("admin.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold">{activeEmployees.length}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("admin.employees")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold">{activeEmployees.filter(e => e.online).length}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("admin.online")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("admin.totalTickets")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold">{stats ? stats.open + stats.inProgress : 0}</div>
            <p className="text-xs text-muted-foreground font-medium mt-1">{t("admin.active")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" />
            {t("admin.employees")}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/users")}>
            {t("admin.manage")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {activeEmployees.slice(0, 8).map(emp => (
              <div key={emp.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {emp.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate">{emp.name}</span>
                    {roleBadge(emp.role)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{emp.email} · {emp.department}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={emp.online ? "text-green-600 font-medium" : ""}>
                    {emp.online ? t("admin.online") : t("admin.offline")}
                  </span>
                  <span>{t("admin.ticketCount", { count: emp.activeTickets })}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            {t("admin.roleStats")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { role: "admin", label: t("admin.admins"), icon: Shield },
              { role: "senior_agent", label: t("admin.seniorAgents"), icon: UserCog },
              { role: "agent", label: t("admin.agents"), icon: Users },
            ].map(({ role, label, icon: Icon }) => {
              const count = employees.filter(e => e.role === role).length
              return (
                <div key={role} className="flex items-center gap-3 bg-muted/30 rounded-lg p-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{count}</div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
