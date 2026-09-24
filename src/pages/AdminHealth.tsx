import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import {
  HeartPulse,
  Loader2,
  RefreshCw,
  Database,
  Server,
  Search as SearchIcon,
  Mail,
  Inbox,
  Layers,
  CheckCircle2,
} from 'lucide-react'

interface HealthCheck {
  name: string
  label: string
  ok: boolean
  latency?: number
  message?: string
}

interface QueueInfo {
  mode: string
  queues: { name: string; error?: string }[]
  note?: string
}

interface HealthData {
  checks: HealthCheck[]
  queue: QueueInfo
  updatedAt: string
}

interface MigrationRow {
  name: string
  batch: number | null
  time: string | null
}

interface MigrationsData {
  applied: MigrationRow[]
  pending: string[]
  appliedCount: number
  pendingCount: number
}

const CHECK_ICONS: Record<string, typeof Database> = {
  db: Database,
  redis: Server,
  meili: SearchIcon,
  smtp: Mail,
  imap: Inbox,
}

export default function AdminHealth() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [migrations, setMigrations] = useState<MigrationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const [h, m] = await Promise.all([api.get('/admin/health'), api.get('/admin/migrations')])
      if (h) setHealth(h as HealthData)
      if (m) setMigrations(m as MigrationsData)
    } catch {
      /* ignore */
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const totalChecks = health?.checks.length ?? 0
  const okChecks = health?.checks.filter((c) => c.ok).length ?? 0
  const queueOk = health?.queue?.mode === 'bullmq' && (health.queue.queues?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.health')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('admin.healthSubtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={refreshing}
          aria-label={t('admin.healthRefresh')}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('admin.healthRefresh')}</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card data-testid="health-checks">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-primary" />
                {t('admin.health')}
                <span className="text-xs font-normal text-muted-foreground ml-auto">
                  <CheckCircle2 className="w-3.5 h-3.5 inline text-green-600 mr-1" />
                  {okChecks}/{totalChecks}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {health?.checks.map((check) => {
                const Icon = CHECK_ICONS[check.name] || Server
                return (
                  <div
                    key={check.name}
                    data-testid={`check-${check.name}`}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${check.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate">{check.label}</p>
                        <Badge className={check.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}>
                          {check.ok ? t('admin.healthOk') : t('admin.healthFail')}
                        </Badge>
                      </div>
                      {check.latency !== undefined && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t('admin.healthLatency')}: {check.latency}ms
                        </p>
                      )}
                      {check.message && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate" title={check.message}>
                          {check.message}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Очередь */}
              <div
                data-testid="check-queue"
                className={`flex items-start gap-3 rounded-lg border p-3 ${queueOk ? '' : 'bg-muted/20'}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${queueOk ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                >
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate">{t('admin.healthQueue')}</p>
                    <Badge className={queueOk ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                      {queueOk ? t('admin.healthOk') : t('admin.healthFail')}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate" title={health?.queue?.note}>
                    {health?.queue?.note || `${health?.queue?.queues?.length ?? 0} queues`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="migrations-card">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {t('admin.migrations')}
                <span className="text-xs font-normal text-muted-foreground ml-auto">
                  {migrations?.appliedCount ?? 0} {t('admin.migrationsApplied')} · {migrations?.pendingCount ?? 0}{' '}
                  {t('admin.migrationsPending')}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {migrations && migrations.pending.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {t('admin.migrationsPending')}: {migrations.pending.join(', ')}
                </div>
              )}
              {!migrations || (migrations.applied.length === 0 && migrations.pending.length === 0) ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.migrationsNone')}</p>
              ) : (
                <div className="overflow-x-auto" data-testid="migrations-table">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">{t('admin.migrationsName')}</th>
                        <th className="py-2 pr-3 font-semibold">{t('admin.migrationsBatch')}</th>
                        <th className="py-2 font-semibold">{t('admin.migrationsTime')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {migrations.applied.map((m) => (
                        <tr key={m.name} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{m.name}</td>
                          <td className="py-2 pr-3 text-xs">{m.batch ?? '—'}</td>
                          <td className="py-2 text-xs">{m.time ? new Date(m.time).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                      {migrations.pending.map((name) => (
                        <tr key={name} className="border-b last:border-0 bg-amber-50/50">
                          <td className="py-2 pr-3 font-mono text-xs text-amber-800">{name}</td>
                          <td className="py-2 pr-3 text-xs text-amber-800">—</td>
                          <td className="py-2 text-xs text-amber-800">⏳ {t('admin.migrationsPending')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
