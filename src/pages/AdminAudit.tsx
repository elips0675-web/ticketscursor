import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, Clock, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-100 text-green-700',
  status_changed: 'bg-blue-100 text-blue-700',
  priority_changed: 'bg-orange-100 text-orange-700',
  assigned: 'bg-purple-100 text-purple-700',
}

export default function AdminAudit() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api
      .get('/admin/audit')
      .then((data) => {
        setLogs(data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      created: t('admin.created'),
      status_changed: t('admin.statusChanged'),
      priority_changed: t('admin.priorityChanged'),
      assigned: t('admin.assigned'),
    }
    return map[action] || action
  }

  const filtered = search
    ? logs.filter(
        (l) =>
          (l.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
          (l.details || '').toLowerCase().includes(search.toLowerCase()),
      )
    : logs

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.audit')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('admin.auditSubtitle')}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <label htmlFor="auditSearch" className="sr-only">
          {t('admin.searchAudit')}
        </label>
        <Input
          id="auditSearch"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.searchAudit')}
          className="pl-9"
        />
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
        <div className="space-y-2">
          {filtered.map((log) => {
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
      )}
    </div>
  )
}
