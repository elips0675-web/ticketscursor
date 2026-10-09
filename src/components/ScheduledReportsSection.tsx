import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, CalendarClock, Trash2, Play, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useFeature } from '@/hooks/useFeature'

const REPORT_TYPES = ['tickets_summary', 'sla_summary', 'csat_summary']

interface ScheduledReportRow {
  id?: number
  isNew?: boolean
  name: string
  reportType: string
  recipientsText: string
  cronExpr: string
  enabled: boolean
  lastRunAt?: string | null
  nextRunAt?: string | null
}

function toRow(raw: {
  id?: number
  name?: string
  report_type?: string
  recipients?: unknown
  cron_expr?: string
  enabled?: boolean
  last_run_at?: string | null
  next_run_at?: string | null
}): ScheduledReportRow {
  const recipients = Array.isArray(raw.recipients) ? raw.recipients.filter((e): e is string => typeof e === 'string') : []
  return {
    id: raw.id,
    name: raw.name || '',
    reportType: raw.report_type || REPORT_TYPES[0],
    recipientsText: recipients.join(', '),
    cronExpr: raw.cron_expr || '0 9 * * 1-5',
    enabled: !!raw.enabled,
    lastRunAt: raw.last_run_at || null,
    nextRunAt: raw.next_run_at || null,
  }
}

function emptyRow(): ScheduledReportRow {
  return { isNew: true, name: '', reportType: REPORT_TYPES[0], recipientsText: '', cronExpr: '0 9 * * 1-5', enabled: false }
}

export default function ScheduledReportsSection() {
  const { t } = useTranslation()
  const flagOn = useFeature('scheduled_reports')
  const [rows, setRows] = useState<ScheduledReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!flagOn) return
    api
      .get('/admin/scheduled-reports')
      .then((data) => {
        if (Array.isArray(data)) setRows((data as Parameters<typeof toRow>[0][]).map(toRow))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [flagOn])

  if (!flagOn) return null

  const patch = (row: ScheduledReportRow, upd: Partial<ScheduledReportRow>) =>
    setRows((prev) => prev.map((x) => (x === row ? { ...x, ...upd } : x)))

  const saveRow = async (row: ScheduledReportRow) => {
    if (!row.name.trim()) {
      toast.error(t('admin.scheduledReportsNameRequired'))
      return
    }
    const recipients = row.recipientsText
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      toast.error(t('admin.scheduledReportsRecipientsRequired'))
      return
    }
    setSaving(true)
    const payload = {
      name: row.name,
      reportType: row.reportType,
      recipients,
      cronExpr: row.cronExpr,
      enabled: row.enabled,
    }
    try {
      if (row.isNew || !row.id) {
        const created = (await api.post('/admin/scheduled-reports', payload)) as Parameters<typeof toRow>[0] | null
        setRows((prev) => prev.map((x) => (x === row ? toRow(created || {}) : x)))
      } else {
        const updated = (await api.put(`/admin/scheduled-reports/${row.id}`, payload)) as Parameters<typeof toRow>[0] | null
        setRows((prev) => prev.map((x) => (x === row ? toRow(updated || {}) : x)))
      }
      toast.success(t('admin.saveSuccess'))
    } catch {
      /* handled by api client */
    }
    setSaving(false)
  }

  const removeRow = async (row: ScheduledReportRow) => {
    if (row.isNew || !row.id) {
      setRows((prev) => prev.filter((x) => x !== row))
      return
    }
    try {
      await api.delete(`/admin/scheduled-reports/${row.id}`)
      setRows((prev) => prev.filter((x) => x !== row))
      toast.success(t('admin.scheduledReportsDeleted'))
    } catch {
      /* handled by api client */
    }
  }

  const runNow = async (row: ScheduledReportRow) => {
    if (!row.id) return
    try {
      const res = (await api.post(`/admin/scheduled-reports/${row.id}/run`, {})) as { recipients?: number } | null
      toast.success(t('admin.scheduledReportsRunDone', { count: res?.recipients ?? 0 }))
    } catch {
      /* handled by api client */
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            {t('admin.scheduledReports')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          {t('admin.scheduledReports')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.scheduledReportsSubtitle')}</p>
        {rows.map((row, index) => (
          <div key={row.id ?? `new-${index}`} className="space-y-3 rounded-lg border p-4" data-testid={`scheduled-report-${row.id ?? 'new'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('admin.scheduledReportsName')}</label>
                <Input
                  value={row.name}
                  onChange={(e) => patch(row, { name: e.target.value })}
                  data-testid={`scheduled-report-name-${row.id ?? 'new'}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('admin.scheduledReportsType')}</label>
                <select
                  value={row.reportType}
                  onChange={(e) => patch(row, { reportType: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {REPORT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`admin.scheduledReportType_${type}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('admin.scheduledReportsRecipients')}</label>
              <Input
                value={row.recipientsText}
                onChange={(e) => patch(row, { recipientsText: e.target.value })}
                placeholder="ops@company.ru, lead@company.ru"
                data-testid={`scheduled-report-recipients-${row.id ?? 'new'}`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('admin.scheduledReportsCron')}</label>
                <Input
                  value={row.cronExpr}
                  onChange={(e) => patch(row, { cronExpr: e.target.value })}
                  placeholder="0 9 * * 1-5"
                  data-testid={`scheduled-report-cron-${row.id ?? 'new'}`}
                />
              </div>
              <label className="flex items-center gap-2 text-sm self-end pb-1">
                <input type="checkbox" checked={row.enabled} onChange={(e) => patch(row, { enabled: e.target.checked })} />
                {t('admin.scheduledReportsEnabled')}
              </label>
            </div>
            {row.nextRunAt && (
              <p className="text-xs text-muted-foreground">
                {t('admin.scheduledReportsNextRun')}: {new Date(row.nextRunAt).toLocaleString('ru-RU')}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={() => saveRow(row)} disabled={saving} data-testid={`scheduled-report-save-${row.id ?? 'new'}`}>
                {t('common.save')}
              </Button>
              {!row.isNew && row.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => runNow(row)}
                  className="gap-1"
                  data-testid={`scheduled-report-run-${row.id}`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {t('admin.scheduledReportsRunNow')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeRow(row)}
                className="gap-1 text-destructive"
                data-testid={`scheduled-report-delete-${row.id ?? 'new'}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted-foreground">{t('admin.scheduledReportsEmpty')}</p>}
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="gap-1.5">
          <Plus className="w-4 h-4" />
          {t('admin.scheduledReportsAdd')}
        </Button>
      </CardContent>
    </Card>
  )
}
