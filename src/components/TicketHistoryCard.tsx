import { useEffect, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileDown,
  Flag,
  History,
  ListChecks,
  Loader2,
  PlusCircle,
  RefreshCw,
  Tag,
  TimerOff,
  TimerReset,
  User,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDate, formatTime } from '@/lib/utils'

export interface TicketHistoryEvent {
  id: number
  user_id: number | null
  user_name: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

export default function TicketHistoryCard({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<TicketHistoryEvent[] | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get<TicketHistoryEvent[]>(`/tickets/${ticketId}/history`)
      .then((data) => {
        if (!active) return
        setEvents(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!active) return
        setEvents([])
      })
    return () => {
      active = false
    }
  }, [ticketId])

  const statusLabel = (v: string) =>
    ({
      open: t('tickets.open'),
      in_progress: t('tickets.inProgress'),
      resolved: t('tickets.resolved'),
      closed: t('tickets.closed'),
    })[v] || v

  const priorityLabel = (v: string) =>
    ({ low: t('tickets.low'), medium: t('tickets.medium'), high: t('tickets.high'), critical: t('tickets.critical') })[
      v
    ] || v

  function actionLabel(action: string): string {
    const map: Record<string, string> = {
      created: t('tickets.historyCreated'),
      status_changed: t('tickets.historyStatusChanged'),
      priority_changed: t('tickets.historyPriorityChanged'),
      assigned: t('tickets.historyAssigned'),
      tags_updated: t('tickets.historyTagsUpdated'),
      custom_fields_updated: t('tickets.historyCustomFieldsUpdated'),
      time_added: t('tickets.historyTimeAdded'),
      time_removed: t('tickets.historyTimeRemoved'),
      time_timer_stopped: t('tickets.historyTimerStopped'),
    }
    return map[action] || t('tickets.historyUnknown', { action })
  }

  function actionIcon(action: string): ComponentType<{ className?: string }> {
    const map: Record<string, ComponentType<{ className?: string }>> = {
      created: PlusCircle,
      status_changed: RefreshCw,
      priority_changed: Flag,
      assigned: User,
      tags_updated: Tag,
      custom_fields_updated: ListChecks,
      time_added: TimerReset,
      time_removed: TimerOff,
    }
    return map[action] || History
  }

  function detailText(ev: TicketHistoryEvent): string {
    const d = ev.details || {}
    if (ev.action === 'status_changed') {
      return t('tickets.historyStatusDetail', {
        from: statusLabel(String(d.from || '')),
        to: statusLabel(String(d.to || '')),
      })
    }
    if (ev.action === 'priority_changed') {
      return t('tickets.historyPriorityDetail', {
        from: priorityLabel(String(d.from || '')),
        to: priorityLabel(String(d.to || '')),
      })
    }
    if (ev.action === 'assigned') {
      return String(d.assignedName || '') || t('tickets.historyUnassigned')
    }
    if (ev.action === 'tags_updated' && Array.isArray(d.tags)) {
      return (d.tags as string[]).join(', ')
    }
    return ''
  }

  const exportPdf = async () => {
    setExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      const pageW = doc.internal.pageSize.getWidth()
      doc.setFontSize(16)
      doc.text(`${t('tickets.history')} #${ticketId}`, pageW / 2, 15, { align: 'center' })
      doc.setFontSize(8)
      doc.text(`Сгенерировано: ${new Date().toLocaleString()}`, pageW / 2, 21, { align: 'center' })
      let y = 28
      doc.setFontSize(9)
      ;(events || []).forEach((ev) => {
        if (y > 275) {
          doc.addPage()
          y = 15
        }
        doc.text(`${ev.user_name || '—'} · ${actionLabel(ev.action)}`, 8, y)
        y += 4.5
        const detail = detailText(ev)
        if (detail) {
          doc.text(detail, 10, y)
          y += 4.5
        }
        doc.text(formatDate(ev.created_at) + ' ' + formatTime(ev.created_at), 10, y)
        y += 6
      })
      doc.save(`ticket-${ticketId}-history.pdf`)
    } finally {
      setExporting(false)
    }
  }

  const list = events || []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            {t('tickets.history')}
            {events === null && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          </CardTitle>
          {list.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={exportPdf} disabled={exporting}>
              <FileDown className="w-4 h-4" />
              {t('tickets.historyExportPdf')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tickets.historyEmpty')}</p>
        ) : (
          <ul className="max-h-[380px] overflow-y-auto">
            {list.map((ev) => {
              const Icon = actionIcon(ev.action)
              const detail = detailText(ev)
              return (
                <li key={ev.id} className="flex gap-3 py-2 border-b border-border/60 last:border-0">
                  <span className="mt-0.5 bg-muted rounded-full p-1.5 self-start">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{actionLabel(ev.action)}</p>
                    {detail && <p className="text-sm text-foreground/80">{detail}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {ev.user_name || '—'} · {formatDate(ev.created_at)} {formatTime(ev.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
