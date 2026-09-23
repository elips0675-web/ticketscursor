import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Clock, Loader2, Play, Plus, Square, Trash2, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import type { TimeEntry } from '@/types'

const TRACK_ROLES = ['agent', 'senior_agent', 'admin', 'super_admin']

interface TimerRaw {
  id: number
  ticket_id: number
  user_id: number
  started_at: string
}

interface TimeEntryRaw {
  id: number
  ticket_id: number
  user_id: number
  minutes: number
  description: string
  entry_date: string
  created_at: string
  user?: { id: number; name: string; avatar: string | null } | null
}

interface TimeDataRaw {
  entries: TimeEntryRaw[]
  totalMinutes: number
  totalEntries: number
  activeTimer: TimerRaw | null
}

function mapEntry(raw: TimeEntryRaw): TimeEntry {
  return {
    id: raw.id,
    ticketId: raw.ticket_id,
    userId: raw.user_id,
    userName: raw.user?.name || '',
    minutes: raw.minutes,
    description: raw.description || '',
    entryDate: raw.entry_date,
    createdAt: raw.created_at,
  }
}

export default function TimeTrackingCard({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canTrack = user ? TRACK_ROLES.includes(user.role) : false
  const [data, setData] = useState<TimeDataRaw | null>(null)
  const [minutes, setMinutes] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState<null | 'add' | 'timer'>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!canTrack) return
    try {
      const body = await api.get<TimeDataRaw>(`/tickets/${ticketId}/time`)
      setData(body)
    } catch {
      // api helper already surfaces the error toast
    }
  }, [ticketId, canTrack])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    if (!data?.activeTimer) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [data?.activeTimer])

  if (!user || !canTrack) return null

  const total = data?.totalMinutes ?? 0
  const totalHours = Math.floor(total / 60)
  const totalMinutesLeft = total % 60
  const totalText =
    totalHours > 0
      ? t('tickets.timeFormatHours', { h: totalHours, m: totalMinutesLeft })
      : t('tickets.timeFormatMinutes', { m: totalMinutesLeft })

  const elapsedText = (() => {
    if (!data?.activeTimer) return ''
    const elapsed = Math.max(0, Math.floor((now - new Date(data.activeTimer.started_at).getTime()) / 1000))
    const h = Math.floor(elapsed / 3600)
    const m = Math.floor((elapsed % 3600) / 60)
    const s = elapsed % 60
    return h > 0 ? t('tickets.timeTimerFormat', { h, m, s }) : t('tickets.timeTimerMinutes', { m, s })
  })()

  const canDelete = (entryUserId: number) =>
    user.role === 'admin' || user.role === 'super_admin' || user.role === 'senior_agent' || entryUserId === user.id

  const handleAdd = async () => {
    const value = Number(minutes)
    if (!Number.isFinite(value) || value < 1 || value > 1440) {
      toast.error(t('tickets.timeInvalidMinutes'))
      return
    }
    setBusy('add')
    try {
      await api.post(`/tickets/${ticketId}/time`, {
        minutes: value,
        description: description.trim(),
      })
      setMinutes('')
      setDescription('')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const handleStart = async () => {
    setBusy('timer')
    try {
      await api.post(`/tickets/${ticketId}/time/timer/start`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const handleStop = async () => {
    setBusy('timer')
    try {
      await api.post(`/tickets/${ticketId}/time/timer/stop`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (entryId: number) => {
    setDeleting(entryId)
    try {
      await api.delete(`/tickets/${ticketId}/time/${entryId}`)
      await load()
    } finally {
      setDeleting(null)
    }
  }

  const entries = (data?.entries ?? []).map(mapEntry)

  return (
    <Card data-testid="time-card">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {t('tickets.timeCard')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold" data-testid="time-total">
            {t('tickets.timeTotal', { time: totalText })}
          </p>
          {data?.activeTimer ? (
            <Button
              size="sm"
              variant="secondary"
              data-testid="time-stop-timer"
              onClick={handleStop}
              disabled={busy === 'timer'}
            >
              <Square className="w-3.5 h-3.5" />
              {t('tickets.timeStop')}
            </Button>
          ) : (
            <Button size="sm" data-testid="time-start-timer" onClick={handleStart} disabled={busy === 'timer'}>
              <Play className="w-3.5 h-3.5" />
              {t('tickets.timeStart')}
            </Button>
          )}
        </div>

        {data?.activeTimer && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid="time-timer">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('tickets.timeTimerRunning', { time: elapsedText })}
          </p>
        )}

        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-bold text-muted-foreground">{t('tickets.timeAdd')}</p>
          <div className="flex gap-2">
            <Input
              data-testid="time-minutes"
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder={t('tickets.timeMinutes')}
              className="w-24"
            />
            <Button
              size="sm"
              data-testid="time-add-button"
              onClick={handleAdd}
              disabled={busy === 'add' || !minutes.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tickets.timeAddButton')}
            </Button>
          </div>
          <Input
            data-testid="time-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('tickets.timeDescription')}
          />
        </div>

        <div className="border-t pt-3 space-y-2.5">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="time-empty">
              {t('tickets.timeNoEntries')}
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} data-testid="time-entry" className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold flex items-center gap-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    {entry.userName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('tickets.timeEntryMinutes', { minutes: entry.minutes })}
                  </p>
                  {entry.description && <p className="text-xs text-foreground/70 break-words">{entry.description}</p>}
                </div>
                {canDelete(entry.userId) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid="time-delete"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deleting === entry.id}
                    aria-label={t('tickets.timeDelete')}
                  >
                    {deleting === entry.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
