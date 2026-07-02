import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Search, Phone, Mail, CheckCircle2, Clock, Users,
  LayoutGrid, List, Shield, UserCog, User,
} from "lucide-react"
import { useTickets } from "@/context/ticket-context"
import type { Employee } from "@/types"

const roleLabels: Record<string, string> = {
  agent: "Агент", senior_agent: "Ст. агент", admin: "Администратор",
}

const roleIcons: Record<string, any> = {
  agent: User, senior_agent: UserCog, admin: Shield,
}

const roleColors: Record<string, string> = {
  agent: "bg-blue-500/10 text-blue-600",
  senior_agent: "bg-purple-500/10 text-purple-600",
  admin: "bg-amber-500/10 text-amber-600",
}

const roleFilterOptions = [
  { value: "", label: "Все" },
  { value: "agent", label: "Агенты" },
  { value: "senior_agent", label: "Ст. агенты" },
  { value: "admin", label: "Администраторы" },
]

export default function Employees() {
  const { employees } = useTickets()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [view, setView] = useState<"cards" | "table">("cards")
  const [sort, setSort] = useState<"name" | "activeTickets" | "resolvedToday">("name")
  const [selected, setSelected] = useState<Employee | null>(null)

  const filtered = useMemo(() => {
    let list = [...employees]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
      )
    }
    if (roleFilter) list = list.filter(e => e.role === roleFilter)
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name)
      if (sort === "activeTickets") return b.activeTickets - a.activeTickets
      return b.resolvedToday - a.resolvedToday
    })
    return list
  }, [employees, search, roleFilter, sort])

  const groupedByDept = useMemo(() => {
    const groups: Record<string, Employee[]> = {}
    filtered.forEach(e => {
      const dept = e.department || "Без отдела"
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(e)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const onlineCount = employees.filter(e => e.online).length
  const roleCounts = useMemo(() => ({
    agent: employees.filter(e => e.role === "agent").length,
    senior_agent: employees.filter(e => e.role === "senior_agent").length,
    admin: employees.filter(e => e.role === "admin").length,
  }), [employees])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-sm text-muted-foreground mt-1">{employees.length} человек · {onlineCount} онлайн</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={view === "cards" ? "default" : "outline"} size="icon" onClick={() => setView("cards")}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant={view === "table" ? "default" : "outline"} size="icon" onClick={() => setView("table")}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени, отделу, email..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {roleFilterOptions.map(o => (
            <Button
              key={o.value}
              variant={roleFilter === o.value ? "default" : "secondary"}
              size="sm"
              className="text-xs"
              onClick={() => setRoleFilter(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Всего: <strong>{employees.length}</strong></span>
        <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Админы: <strong>{roleCounts.admin}</strong></span>
        <span className="flex items-center gap-1"><UserCog className="w-3 h-3" /> Ст. агенты: <strong>{roleCounts.senior_agent}</strong></span>
        <span className="flex items-center gap-1"><User className="w-3 h-3" /> Агенты: <strong>{roleCounts.agent}</strong></span>
      </div>

      {view === "cards" ? (
        <div className="space-y-8">
          {groupedByDept.map(([dept, emps]) => (
            <div key={dept}>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{dept}</h3>
                <Badge variant="secondary" className="text-[9px]">{emps.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {emps.map(emp => (
                  <EmployeeCard key={emp.id} employee={emp} onClick={() => setSelected(emp)} />
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Ничего не найдено</p>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => setSort("name")}>
                  Имя {sort === "name" && "↓"}
                </TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Отдел</TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => setSort("activeTickets")}>
                  Активные {sort === "activeTickets" && "↓"}
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => setSort("resolvedToday")}>
                  Решено {sort === "resolvedToday" && "↓"}
                </TableHead>
                <TableHead className="text-right">Контакты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(emp => {
                const RoleIcon = roleIcons[emp.role] || User
                return (
                  <TableRow key={emp.id} className="cursor-pointer" onClick={() => setSelected(emp)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {emp.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          {emp.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{emp.name}</p>
                          <p className="text-[10px] text-muted-foreground">{emp.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("text-[10px]", roleColors[emp.role])}>
                        <RoleIcon className="w-3 h-3 mr-1" />
                        {roleLabels[emp.role] || emp.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{emp.department}</TableCell>
                    <TableCell className="text-right text-sm">{emp.activeTickets}</TableCell>
                    <TableCell className="text-right text-sm">{emp.resolvedToday}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 text-muted-foreground">
                        {emp.email && <Mail className="w-3.5 h-3.5" />}
                        {emp.phone && <Phone className="w-3.5 h-3.5" />}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Ничего не найдено</p>
            </div>
          )}
        </Card>
      )}

      <EmployeeDetail employee={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function EmployeeCard({ employee, onClick }: { employee: Employee; onClick: () => void }) {
  const RoleIcon = roleIcons[employee.role] || User
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="text-sm bg-primary/10 text-primary">
                {employee.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            {employee.online && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm truncate">{employee.name}</h4>
            <Badge variant="secondary" className={cn("text-[9px] mt-1", roleColors[employee.role])}>
              <RoleIcon className="w-3 h-3 mr-0.5" />
              {roleLabels[employee.role] || employee.role}
            </Badge>
            <p className="text-[10px] text-muted-foreground mt-1.5">{employee.department}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {employee.activeTickets} активных
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            {employee.resolvedToday} сегодня
          </div>
        </div>

        {(employee.email || employee.phone) && (
          <div className="mt-3 pt-3 border-t space-y-1">
            {employee.email && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Mail className="w-3 h-3" />
                {employee.email}
              </div>
            )}
            {employee.phone && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Phone className="w-3 h-3" />
                {employee.phone}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmployeeDetail({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  if (!employee) return null
  const RoleIcon = roleIcons[employee.role] || User
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сотрудник</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative mb-3">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {employee.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            {employee.online && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>
          <h3 className="text-lg font-bold">{employee.name}</h3>
          <Badge variant="secondary" className={cn("mt-1", roleColors[employee.role])}>
            <RoleIcon className="w-3 h-3 mr-1" />
            {roleLabels[employee.role] || employee.role}
          </Badge>
          <p className="text-sm text-muted-foreground mt-1">{employee.department}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm mt-4">
          {employee.email && (
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <Mail className="w-4 h-4" />
              <span>{employee.email}</span>
            </div>
          )}
          {employee.phone && (
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <Phone className="w-4 h-4" />
              <span>{employee.phone}</span>
            </div>
          )}
        </div>
        <div className="flex justify-center gap-6 mt-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold">{employee.activeTickets}</p>
            <p className="text-xs text-muted-foreground">Активных тикетов</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{employee.resolvedToday}</p>
            <p className="text-xs text-muted-foreground">Решено сегодня</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}
