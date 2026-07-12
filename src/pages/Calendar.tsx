import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, Plus, Bell, Clock, Trash2, Download, Pencil } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { CalendarEvent } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

async function fetchCalendar(year: number, month: number): Promise<CalendarEvent[]> {
  return api.get(`/calendar?year=${year}&month=${month + 1}`)
}

export default function CalendarPage() {
  const { t } = useTranslation()
  const { canManage } = useAuth()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(new Date())
  const [selDay, setSelDay] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState({ title: '', time: '', description: '' })

  const year = date.getFullYear()
  const month = date.getMonth()

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => fetchCalendar(year, month),
    enabled: true,
  })

  const addMutation = useMutation({
    mutationFn: (body: { title: string; date: string; time: string | null; description: string | null }) =>
      api.post('/calendar', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      setForm({ title: '', time: '', description: '' })
      setShowAdd(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/calendar/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar'] }),
  })

  const editMutation = useMutation({
    mutationFn: (body: { id: number; title: string; date: string; time: string | null; description: string | null }) =>
      api.put(`/calendar/${body.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      setEditingEvent(null)
      setForm({ title: '', time: '', description: '' })
    },
  })

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const today = new Date()

  const dayEvents = selDay
    ? events.filter((e) => {
        const d = new Date(e.date)
        return d.getDate() === selDay && d.getMonth() === month && d.getFullYear() === year
      })
    : []

  const isToday = (day: number) => today.getDate() === day && today.getMonth() === month && today.getFullYear() === year

  const saveEvent = () => {
    if (!form.title.trim()) return
    if (editingEvent) {
      editMutation.mutate({
        id: editingEvent.id,
        title: form.title,
        date: editingEvent.date,
        time: form.time || null,
        description: form.description || null,
      })
    } else if (selDay) {
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selDay).padStart(2, '0')}`
      addMutation.mutate({
        title: form.title,
        date: dayStr,
        time: form.time || null,
        description: form.description || null,
      })
    }
  }

  const prevMonth = () => setDate(new Date(year, month - 1, 1))
  const nextMonth = () => setDate(new Date(year, month + 1, 1))

  const exportCSV = () => {
    const headers = ['ID', 'Название', 'Дата', 'Время', 'Описание']
    const rows = events.map((e) => [
      e.id,
      `"${e.title.replace(/"/g, '""')}"`,
      e.date,
      e.time || '',
      `"${(e.description || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `calendar-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('calendar.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('calendar.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-1" />
          {t('calendar.exportCSV')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={prevMonth} className="gap-1" aria-label="Предыдущий месяц">
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{MONTHS_RU[month - 1] || ''}</span>
            </Button>
            <h3 className="font-bold text-base sm:text-lg">
              {MONTHS_RU[month]} {year}
            </h3>
            <Button variant="outline" size="sm" onClick={nextMonth} className="gap-1" aria-label="Следующий месяц">
              <span className="hidden sm:inline">{MONTHS_RU[month + 1] || ''}</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                </div>
              ) : (
                <div className="calendar-grid">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                    <div key={d} className="calendar-header">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: offset }).map((_, i) => (
                    <div key={`e${i}`} className="calendar-day empty">
                      <span className="calendar-date">{''}</span>
                    </div>
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dayEvts = events.filter((e) => {
                      const d = new Date(e.date)
                      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year
                    })
                    return (
                      <div
                        key={day}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelDay(day)
                          }
                        }}
                        className={`calendar-day${selDay === day ? ' selected' : ''}${isToday(day) ? ' today' : ''}`}
                        onClick={() => setSelDay(day)}
                      >
                        <span className="calendar-date">{day}</span>
                        {dayEvts.slice(0, 2).map((e) => (
                          <div key={e.id} className="calendar-event" title={e.title}>
                            {e.title}
                          </div>
                        ))}
                        {dayEvts.length > 2 && <div className="calendar-more">+{dayEvts.length - 2}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">
                {selDay ? `${selDay} ${MONTHS_RU[month]}` : t('calendar.selectDay')}
              </CardTitle>
              {selDay && (
                <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {t('calendar.eventBtn')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selDay && <p className="text-sm text-muted-foreground text-center py-8">{t('calendar.clickDay')}</p>}
              {selDay && dayEvents.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">{t('calendar.noEvents')}</p>
              )}
              {selDay &&
                dayEvents.map((e) => (
                  <div key={e.id} className="border-b last:border-b-0 py-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {e.time ? (
                            <Badge variant="secondary" className="text-[9px] gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {e.time}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px]">
                              {t('calendar.allDay')}
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-bold text-sm">{e.title}</h4>
                        {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
                      </div>
                      {canManage && (
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                            onClick={() => {
                              setEditingEvent(e)
                              setForm({ title: e.title, time: e.time || '', description: e.description || '' })
                            }}
                            aria-label={t('common.edit')}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                            onClick={() => deleteMutation.mutate(e.id)}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                {t('calendar.upcoming')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events
                .filter((e) => new Date(e.date) >= today)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(0, 3)
                .map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                    <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(e.date)}
                        {e.time ? ` ${t('calendar.at')} ${e.time}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={showAdd || !!editingEvent}
        onOpenChange={(open) => {
          if (!open) {
            setShowAdd(false)
            setEditingEvent(null)
            setForm({ title: '', time: '', description: '' })
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingEvent ? t('calendar.editEvent') : t('calendar.createEvent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="event-title" className="text-sm font-bold">
                {t('calendar.eventTitle')}
              </label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t('calendar.eventPlaceholderTitle')}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-time" className="text-sm font-bold">
                {t('calendar.eventTime')}
              </label>
              <Input
                id="event-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-desc" className="text-sm font-bold">
                {t('calendar.eventDesc')}
              </label>
              <Textarea
                id="event-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdd(false)
                setEditingEvent(null)
                setForm({ title: '', time: '', description: '' })
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={saveEvent}
              disabled={!form.title.trim() || addMutation.isPending || editMutation.isPending}
            >
              {addMutation.isPending || editMutation.isPending
                ? t('common.loading')
                : editingEvent
                  ? t('common.save')
                  : t('calendar.submitBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
