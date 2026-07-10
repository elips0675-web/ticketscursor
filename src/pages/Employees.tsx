import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  Users,
  LayoutGrid,
  List,
  Shield,
  UserCog,
  User,
  Download,
  MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTickets } from '@/context/ticket-context'
import { SkeletonCardGrid, SkeletonTableRow } from '@/components/skeletons'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import type { Employee } from '@/types'

const roleIcons: Record<string, any> = {
  agent: User,
  senior_agent: UserCog,
  admin: Shield,
}

const roleColors: Record<string, string> = {
  agent: 'bg-blue-500/10 text-blue-600',
  senior_agent: 'bg-purple-500/10 text-purple-600',
  admin: 'bg-amber-500/10 text-amber-600',
}

export default function Employees() {
  const { t } = useTranslation()
  const { employees, loading } = useTickets()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [sort, setSort] = useState<'name' | 'activeTickets' | 'resolvedToday'>('name')
  const [selected, setSelected] = useState<Employee | null>(null)

  const openChat = async (userId: number) => {
    try {
      const chat = await api.post(`/chats/personal/${userId}`)
      navigate(`/chats/${chat.id}`)
    } catch { /* toast handled by api client */ }
  }

  const roleLabels: Record<string, string> = {
    agent: t('employees.agent'),
    senior_agent: t('employees.seniorAgent'),
    admin: t('employees.admin'),
  }

  const roleFilterOptions = [
    { value: '', label: t('common.all') },
    { value: 'agent', label: t('employees.agents') },
    { value: 'senior_agent', label: t('employees.seniorAgents') },
    { value: 'admin', label: t('employees.admins') },
  ]

  const filtered = useMemo(() => {
    let list = [...employees]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q),
      )
    }
    if (roleFilter) list = list.filter((e) => e.role === roleFilter)
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'activeTickets') return b.activeTickets - a.activeTickets
      return b.resolvedToday - a.resolvedToday
    })
    return list
  }, [employees, search, roleFilter, sort])

  const groupedByDept = useMemo(() => {
    const groups: Record<string, Employee[]> = {}
    filtered.forEach((e) => {
      const dept = e.department || 'Без отдела'
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(e)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const onlineCount = employees.filter((e) => e.online).length

  const exportCSV = () => {
    const data = filtered
    const headers = ['ID', 'Имя', 'Email', 'Роль', 'Отдел', 'Тикетов', 'Решено']
    const rows = data.map((e) => [
      e.id,
      `"${e.name.replace(/"/g, '""')}"`,
      e.email,
      roleLabels[e.role] || e.role,
      e.department,
      e.activeTickets,
      e.resolvedToday,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const roleCounts = useMemo(
    () => ({
      agent: employees.filter((e) => e.role === 'agent').length,
      senior_agent: employees.filter((e) => e.role === 'senior_agent').length,
      admin: employees.filter((e) => e.role === 'admin').length,
    }),
    [employees],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('employees.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {employees.length} человек · {onlineCount} {t('employees.online')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" />
            {t('employees.exportCSV')}
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as 'cards' | 'table')}>
            <TabsList className="h-9">
              <TabsTrigger value="cards" className="px-2" aria-label={t('employees.cardsView')}>
                <LayoutGrid className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="table" className="px-2" aria-label={t('employees.tableView')}>
                <List className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('employees.searchPlaceholder')}
            className="pl-9"
            aria-label={t('employees.searchPlaceholder')}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {roleFilterOptions.map((o) => (
            <Button
              key={o.value}
              variant={roleFilter === o.value ? 'default' : 'secondary'}
              size="sm"
              className="text-xs"
              onClick={() => setRoleFilter(o.value)}
              aria-pressed={roleFilter === o.value}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" /> Всего: <strong>{employees.length}</strong>
        </span>
        <span className="flex items-center gap-1">
          <Shield className="w-3 h-3" /> Админы: <strong>{roleCounts.admin}</strong>
        </span>
        <span className="flex items-center gap-1">
          <UserCog className="w-3 h-3" /> Ст. агенты: <strong>{roleCounts.senior_agent}</strong>
        </span>
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" /> Агенты: <strong>{roleCounts.agent}</strong>
        </span>
      </div>

      {loading ? (
        view === 'cards' ? <SkeletonCardGrid count={6} cols={3} /> : <div className="space-y-1"><SkeletonTableRow /><SkeletonTableRow /><SkeletonTableRow /><SkeletonTableRow /></div>
      ) : view === 'cards' ? (
        <div className="space-y-8">
          {groupedByDept.map(([dept, emps]) => (
            <div key={dept}>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{dept}</h3>
                <Badge variant="secondary" className="text-[9px]">
                  {emps.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {emps.map((emp) => (
                  <EmployeeCard
                    key={emp.id}
                    employee={emp}
                    onClick={() => setSelected(emp)}
                    onChat={() => openChat(emp.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" role="status">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('employees.noData')}</p>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => setSort('name')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSort('name')
                    }
                  }}
                  aria-sort={sort === 'name' ? 'ascending' : undefined}
                >
                  {t('employees.sortName')} {sort === 'name' && '↓'}
                </TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Отдел</TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => setSort('activeTickets')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSort('activeTickets')
                    }
                  }}
                  aria-sort={sort === 'activeTickets' ? 'ascending' : undefined}
                >
                  {t('employees.sortTickets')} {sort === 'activeTickets' && '↓'}
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => setSort('resolvedToday')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSort('resolvedToday')
                    }
                  }}
                  aria-sort={sort === 'resolvedToday' ? 'ascending' : undefined}
                >
                  {t('employees.sortResolved')} {sort === 'resolvedToday' && '↓'}
                </TableHead>
                <TableHead className="text-right">Контакты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => {
                const RoleIcon = roleIcons[emp.role] || User
                return (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(emp)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(emp)
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {emp.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>
                          {emp.online && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{emp.name}</p>
                          <p className="text-[10px] text-muted-foreground">{emp.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn('text-[10px]', roleColors[emp.role])}>
                        <RoleIcon className="w-3 h-3 mr-1" />
                        {roleLabels[emp.role] || emp.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{emp.department}</TableCell>
                    <TableCell className="text-right text-sm">{emp.activeTickets}</TableCell>
                    <TableCell className="text-right text-sm">{emp.resolvedToday}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 text-muted-foreground">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            openChat(emp.id)
                          }}
                          aria-label={t('employees.write')}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
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
            <div className="text-center py-12 text-muted-foreground" role="status">
              <p className="text-lg font-medium">{t('employees.noData')}</p>
            </div>
          )}
        </Card>
      )}

      <EmployeeDetail employee={selected} onClose={() => setSelected(null)} onChat={openChat} />
    </div>
  )
}

function EmployeeCard({ employee, onClick, onChat }: { employee: Employee; onClick: () => void; onChat: () => void }) {
  const { t } = useTranslation()
  const roleLabels: Record<string, string> = {
    agent: t('employees.agent'),
    senior_agent: t('employees.seniorAgent'),
    admin: t('employees.admin'),
  }
  const RoleIcon = roleIcons[employee.role] || User
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="text-sm bg-primary/10 text-primary">
                {employee.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            {employee.online && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm truncate">{employee.name}</h4>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="secondary" className={cn('text-[9px]', roleColors[employee.role])}>
                <RoleIcon className="w-3 h-3 mr-0.5" />
                {roleLabels[employee.role] || employee.role}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 ml-auto"
                onClick={(e) => {
                  e.stopPropagation()
                  onChat()
                }}
                aria-label={t('employees.write')}
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">{employee.department}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t('employees.activeTickets', { count: employee.activeTickets })}
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            {employee.resolvedToday} {t('employees.resolvedToday')}
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

function EmployeeDetail({
  employee,
  onClose,
  onChat,
}: {
  employee: Employee | null
  onClose: () => void
  onChat?: (id: number) => void
}) {
  const { t } = useTranslation()
  if (!employee) return null
  const roleLabels: Record<string, string> = {
    agent: t('employees.agent'),
    senior_agent: t('employees.seniorAgent'),
    admin: t('employees.admin'),
  }
  const RoleIcon = roleIcons[employee.role] || User
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('employees.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative mb-3">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {employee.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            {employee.online && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>
          <h3 className="text-lg font-bold">{employee.name}</h3>
          <Badge variant="secondary" className={cn('mt-1', roleColors[employee.role])}>
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
            <p className="text-xs text-muted-foreground">
              {t('employees.activeTickets', { count: employee.activeTickets })}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{employee.resolvedToday}</p>
            <p className="text-xs text-muted-foreground">{t('employees.resolvedToday')}</p>
          </div>
        </div>
        {onChat && (
          <div className="mt-4">
            <Button className="w-full gap-2" onClick={() => onChat(employee.id)}>
              <MessageCircle className="w-4 h-4" />
              {t('employees.write')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}
