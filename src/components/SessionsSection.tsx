import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Monitor, Smartphone, Loader2, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFeature } from '@/hooks/useFeature'
import { API_URL } from '@/lib/api'

interface SessionItem {
  id: number
  device: string
  ip: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}

async function apiJson<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((json as { message?: string }).message || 'Request failed')
  }
  return (json as { data: T }).data
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

export default function SessionsSection() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const flagOn = useFeature('user_sessions')

  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!flagOn || !token) return
    let cancelled = false
    apiJson<{ sessions: SessionItem[] }>('/auth/sessions', token)
      .then((data) => {
        if (!cancelled) setSessions(data.sessions || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [flagOn, token])

  if (!flagOn) return null

  const revoke = async (id: number) => {
    setBusyId(id)
    setError('')
    setInfo('')
    try {
      await apiJson(`/auth/sessions/${id}/revoke`, token, { method: 'POST' })
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setInfo(t('profile.sessionRevoked'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const revokeAll = async () => {
    setBusyId(-1)
    setError('')
    setInfo('')
    try {
      await apiJson('/auth/revoke-all', token, { method: 'POST' })
      setSessions([])
      setInfo(t('profile.sessionsRevoked'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          {t('profile.sessions')}
        </CardTitle>
        <CardDescription className="text-xs">{t('profile.sessionsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{t('profile.noSessions')}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {s.device}
                        {s.current && (
                          <Badge variant="secondary" className="text-[9px]">
                            {t('profile.currentSession')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.ip ? `${s.ip} • ` : ''}
                        {formatDate(s.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  {!s.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revoke(s.id)}
                      disabled={busyId !== null}
                      className="shrink-0 gap-1"
                    >
                      {busyId === s.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5" />
                      )}
                      {t('profile.revokeSession')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={revokeAll} disabled={busyId !== null} className="gap-1">
                {busyId === -1 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                {t('profile.revokeAllSessions')}
              </Button>
            </div>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {info && <p className="text-sm text-emerald-600">{info}</p>}
      </CardContent>
    </Card>
  )
}
