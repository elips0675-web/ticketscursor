import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { Layers, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

interface QueueRow {
  name: string
  waiting?: number
  active?: number
  completed?: number
  failed?: number
  delayed?: number
  error?: string
}

interface QueueStats {
  mode: 'in-memory' | 'bullmq'
  queues: QueueRow[]
  note?: string
}

const PAGE_SIZE = 3

export default function AdminQueues() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(0)

  const fetchStats = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await api.get('/admin/queues')
      if (data) setStats(data as QueueStats)
    } catch {
      /* ignore */
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats()
  }, [fetchStats])

  const visibleQueues = stats?.queues.slice(0, (page + 1) * PAGE_SIZE) ?? []
  const hasMore = stats ? (page + 1) * PAGE_SIZE < stats.queues.length : false

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.queues')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('admin.queuesSubtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          disabled={refreshing}
          aria-label={t('admin.queuesRefresh')}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('admin.queuesRefresh')}</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !stats ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('admin.queuesNoJobs')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card data-testid="queue-mode">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {t('admin.queues')}
                <Badge
                  className={stats.mode === 'bullmq' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
                >
                  {stats.mode === 'bullmq' ? 'BullMQ' : 'setInterval'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.note && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{stats.note}</span>
                </div>
              )}
              {stats.mode === 'bullmq' && stats.queues.length === 0 && (
                <div className="flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{t('admin.queuesNoJobs')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {visibleQueues.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="queue-cards">
              {visibleQueues.map((q) =>
                q.error ? (
                  <Card key={q.name} data-testid={`queue-${q.name}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <p className="text-sm font-bold font-mono">{q.name}</p>
                      </div>
                      <p className="text-xs text-red-600 truncate">{q.error}</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card key={q.name} data-testid={`queue-${q.name}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-sm font-bold font-mono">{q.name}</p>
                      </div>
                      <div className="grid grid-cols-5 gap-2 text-center">
                        {[
                          { label: t('admin.queuesWaiting'), value: q.waiting ?? 0, testid: 'waiting' },
                          { label: t('admin.queuesActive'), value: q.active ?? 0, testid: 'active' },
                          { label: t('admin.queuesCompleted'), value: q.completed ?? 0, testid: 'completed' },
                          { label: t('admin.queuesFailed'), value: q.failed ?? 0, testid: 'failed' },
                          { label: t('admin.queuesDelayed'), value: q.delayed ?? 0, testid: 'delayed' },
                        ].map((cell) => (
                          <div
                            key={cell.testid}
                            className="rounded-lg bg-muted/40 p-2"
                            data-testid={`queue-${q.name}-${cell.testid}`}
                          >
                            <p className="text-lg font-bold leading-none">{cell.value}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{cell.label}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ),
              )}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center">
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
