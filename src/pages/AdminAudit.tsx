import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, Loader2, Clock, User, Download, FilterX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-100 text-green-700',
  status_changed: 'bg-blue-100 text-blue-700',
  priority_changed: 'bg-orange-100 text-orange-700',
  assigned: 'bg-purple-100 text-purple-700',
}

const ACTION_LABEL_KEYS: Record<string, string> = {
  created: 'admin.created',
  status_changed: 'admin.statusChanged',
  priority_changed: 'admin.priorityChanged',
  assigned: 'admin.assigned',
}

const PAGE_SIZE = 50
const FETCH_LIMIT = 500

interface AuditLogItem {
  id: number
  user_name: string
  action: string
  entity_id: number
  entity_type: string
  details: string
  created_at: string
}

export default function AdminAudit() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api
      .get(`/admin/audit?limit=${FETCH_LIMIT}`)
      .then((data) => {
        setLogs(data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const actions = useMemo(() => [...new Set(logs.map((l) => l.action).filter(Boolean))].sort(), [logs])
  const entityTypes = useMemo(() => [...new Set(logs.map((l) => l.entity_type).filter(Boolean))].sort(), [logs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false
      if (entityFilter && l.entity_type !== entityFilter) return false
      if (fromDate && new Date(l.created_at) < new Date(`${fromDate}T00:00:00`)) return false
      if (toDate && new Date(l.created_at) > new Date(`${toDate}T23:59:59`)) return false
      if (!q) return true
      return (
        (l.user_name || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        (l.entity_type || '').toLowerCase().includes(q)
      )
    })
  }, [logs, search, actionFilter, entityFilter, fromDate, toDate])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = filtered.length > visible.length

  const resetFilters = () => {
    setSearch('')
    setActionFilter('')
    setEntityFilter('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const actionLabel = (action: string) => {
    const key = ACTION_LABEL_KEYS[action]
    return key ? t(key) : action
  }

  const exportCsv = () => {
    const header = 'Date,User,Action,Entity,EntityId,Details'
    const rows = filtered.map((l) =>
      [
        l.created_at,
        `"${(l.user_name || '').replace(/"/g, '""')}"`,
        `"${(l.action || '').replace(/"/g, '""')}"`,
        `"${(l.entity_type || '').replace(/"/g, '""')}"`,
        l.entity_id ?? '',
        `"${(l.details || '').replace(/"/g, '""')}"`,
      ].join(','),
    )
    const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.audit')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('admin.auditSubtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          aria-label={t('admin.auditExport')}
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">{t('admin.auditExport')}</span>
        </Button>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <label htmlFor="auditSearch" className="sr-only">
              {t('admin.searchAudit')}
            </label>
            <Input
              id="auditSearch"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder={t('admin.searchAudit')}
              className="pl-9"
            />
          </div>

          <label htmlFor="auditActionFilter" className="sr-only">
            {t('admin.auditFilterAction')}
          </label>
          <select
            id="auditActionFilter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            data-testid="audit-action-filter"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t('admin.auditFilterAction')}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>

          <label htmlFor="auditEntityFilter" className="sr-only">
            {t('admin.auditFilterEntity')}
          </label>
          <select
            id="auditEntityFilter"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value)
              setPage(1)
            }}
            data-testid="audit-entity-filter"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t('admin.auditFilterEntity')}</option>
            {entityTypes.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="auditFrom" className="text-xs text-muted-foreground">
            {t('admin.auditFrom')}
          </label>
          <Input
            id="auditFrom"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setPage(1)
            }}
            data-testid="audit-from"
            className="h-9 w-auto"
          />
          <label htmlFor="auditTo" className="text-xs text-muted-foreground">
            {t('admin.auditTo')}
          </label>
          <Input
            id="auditTo"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setPage(1)
            }}
            data-testid="audit-to"
            className="h-9 w-auto"
          />
          {(search || actionFilter || entityFilter || fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={resetFilters} aria-label={t('admin.auditFiltersReset')}>
              <FilterX className="w-4 h-4" />
              {t('admin.auditFiltersReset')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground" data-testid="audit-count">
          {t('admin.auditShown')} <span className="font-bold">{visible.length}</span> из {filtered.length}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold text-sm">{t('admin.noAudit')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((log) => {
              let details
              try {
                details = log.details ? JSON.stringify(JSON.parse(log.details)) : ''
              } catch {
                details = log.details || ''
              }
              return (
                <Card key={log.id} className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{log.user_name}</span>
                        <Badge className={`text-[9px] ${ACTION_COLORS[log.action] || ''}`}>
                          {actionLabel(log.action)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          #{log.entity_id} {log.entity_type}
                        </span>
                      </div>
                      {details && <p className="text-xs text-muted-foreground mt-1 truncate">{details}</p>}
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                {t('admin.auditShowMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
