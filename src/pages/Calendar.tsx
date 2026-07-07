import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Plus, Bell, Clock, Trash2, Loader2 } from "lucide-react"
import { formatDate } from "@/lib/utils"
import type { CalendarEvent } from "@/types"
import { useAuth } from "@/context/AuthContext"

const API = "http://localhost:4000/api"
const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]

export default function CalendarPage() {
  const { t } = useTranslation()
  const { canManage, token } = useAuth()
  const [date, setDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selDay, setSelDay] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: "", time: "", description: "" })

  const year = date.getFullYear()
  const month = date.getMonth()

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/calendar?year=${year}&month=${month + 1}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setEvents(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token, year, month])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const today = new Date()

  const dayEvents = selDay
    ? events.filter(e => {
        const d = new Date(e.date)
        return d.getDate() === selDay && d.getMonth() === month && d.getFullYear() === year
      })
    : []

  const isToday = (day: number) =>
    today.getDate() === day && today.getMonth() === month && today.getFullYear() === year

  const addEvent = async () => {
    if (!form.title.trim() || !selDay) return
    const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`
    try {
      const res = await fetch(`${API}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: form.title, date: dayStr, time: form.time || null, description: form.description || null }),
      })
      if (res.ok) {
        const evt = await res.json()
        setEvents(prev => [...prev, evt])
      }
    } catch { /* ignore */ }
    setForm({ title: "", time: "", description: "" })
    setShowAdd(false)
  }

  const deleteEvent = async (id: number) => {
    try {
      await fetch(`${API}/calendar/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch { /* ignore */ }
  }

  const prevMonth = () => setDate(new Date(year, month - 1, 1))
  const nextMonth = () => setDate(new Date(year, month + 1, 1))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("calendar.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("calendar.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={prevMonth} className="gap-1" aria-label="Предыдущий месяц">
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{MONTHS_RU[month - 1] || ""}</span>
            </Button>
            <h3 className="font-bold text-base sm:text-lg">{MONTHS_RU[month]} {year}</h3>
            <Button variant="outline" size="sm" onClick={nextMonth} className="gap-1" aria-label="Следующий месяц">
              <span className="hidden sm:inline">{MONTHS_RU[month + 1] || ""}</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
              <div className="calendar-grid">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(d => (
                  <div key={d} className="calendar-header">{d}</div>
                ))}
                {Array.from({ length: offset }).map((_, i) => (
                  <div key={`e${i}`} className="calendar-day empty"><span className="calendar-date">{""}</span></div>
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const dayEvts = events.filter(e => {
                    const d = new Date(e.date)
                    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year
                  })
                  return (
                    <div
                      key={day}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelDay(day) } }}
                      className={`calendar-day${selDay === day ? " selected" : ""}${isToday(day) ? " today" : ""}`}
                      onClick={() => setSelDay(day)}
                    >
                      <span className="calendar-date">{day}</span>
                      {dayEvts.slice(0, 2).map(e => (
                        <div key={e.id} className="calendar-event" title={e.title}>{e.title}</div>
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
                {selDay ? `${selDay} ${MONTHS_RU[month]}` : t("calendar.selectDay")}
              </CardTitle>
              {selDay && (
                <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {t("calendar.eventBtn")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selDay && (
                <p className="text-sm text-muted-foreground text-center py-8">{t("calendar.clickDay")}</p>
              )}
              {selDay && dayEvents.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">{t("calendar.noEvents")}</p>
              )}
              {selDay && dayEvents.map(e => (
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
                          <Badge variant="secondary" className="text-[9px]">{t("calendar.allDay")}</Badge>
                        )}
                      </div>
                      <h4 className="font-bold text-sm">{e.title}</h4>
                      {e.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>
                      )}
                    </div>
                    {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 shrink-0"
                      onClick={() => deleteEvent(e.id)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
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
                {t("calendar.upcoming")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events
                .filter(e => new Date(e.date) >= today)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(0, 3)
                .map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                    <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(e.date)}{e.time ? ` ${t("calendar.at")} ${e.time}` : ""}</p>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("calendar.createEvent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="event-title" className="text-sm font-bold">{t("calendar.eventTitle")}</label>
              <Input
                id="event-title"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={t("calendar.eventPlaceholderTitle")}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-time" className="text-sm font-bold">{t("calendar.eventTime")}</label>
              <Input
                id="event-time"
                type="time"
                value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-desc" className="text-sm font-bold">{t("calendar.eventDesc")}</label>
              <Textarea
                id="event-desc"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>{t("common.cancel")}</Button>
            <Button onClick={addEvent} disabled={!form.title.trim()}>{t("calendar.submitBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
