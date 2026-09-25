import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { BellRing, Loader2, Save } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFeature } from '@/hooks/useFeature'
import { API_URL } from '@/lib/api'

type Prefs = Record<string, Record<string, boolean>>

const EVENTS = [
  'ticket_created',
  'ticket_status',
  'ticket_priority',
  'ticket_assigned',
  'ticket_message',
  'ticket_mention',
  'ticket_sla_overdue',
  'ticket_sla_escalated',
]
const CHANNELS = ['email', 'push', 'in_app'] as const

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

export default function NotificationPreferencesSection() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const flagOn = useFeature('notification_prefs')

  const [prefs, setPrefs] = useState<Prefs>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!flagOn || !token) return
    let cancelled = false
    apiJson<{ prefs: Prefs }>('/notifications/preferences', token)
      .then((data) => {
        if (cancelled) return
        setPrefs(data.prefs || {})
      })
      .catch(() => {
        if (!cancelled) setError('profile.prefs.loadError')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [flagOn, token])

  if (!flagOn) return null

  const isEnabled = (event: string, channel: string): boolean => prefs[event]?.[channel] !== false

  const toggle = (event: string, channel: string) => {
    setPrefs((prev) => ({
      ...prev,
      [event]: { ...(prev[event] || {}), [channel]: !isEnabled(event, channel) },
    }))
    setDirty(true)
    setInfo('')
  }

  const allEnabledForChannel = (channel: string): boolean => EVENTS.every((ev) => isEnabled(ev, channel))

  const toggleChannel = (channel: string) => {
    const next = !allEnabledForChannel(channel)
    setPrefs((prev) => {
      const p: Prefs = { ...prev }
      for (const ev of EVENTS) p[ev] = { ...(p[ev] || {}), [channel]: next }
      return p
    })
    setDirty(true)
    setInfo('')
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await apiJson('/notifications/preferences', token, { method: 'PUT', body: JSON.stringify(prefs) })
      setDirty(false)
      setInfo('profile.prefs.saved')
    } catch {
      setError('profile.prefs.saveError')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5" />
          {t('profile.prefs.title')}
        </CardTitle>
        <CardDescription>{t('profile.prefs.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('common.loading')}</span>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">{t('profile.prefs.eventColumn')}</th>
                  {CHANNELS.map((ch) => (
                    <th key={ch} className="py-2 pr-3 font-medium">
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          aria-label={`${t('profile.prefs.allEvents')} — ${t(`profile.prefs.channel.${ch}`)}`}
                          checked={allEnabledForChannel(ch)}
                          onCheckedChange={() => toggleChannel(ch)}
                        />
                        {t(`profile.prefs.channel.${ch}`)}
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((ev) => (
                  <tr key={ev} className="border-b last:border-0">
                    <td className="py-2 pr-4">{t(`profile.prefs.event.${ev}`)}</td>
                    {CHANNELS.map((ch) => (
                      <td key={ch} className="py-2 pr-3">
                        <Checkbox
                          aria-label={`${t(`profile.prefs.event.${ev}`)} — ${t(`profile.prefs.channel.${ch}`)}`}
                          checked={isEnabled(ev, ch)}
                          onCheckedChange={() => toggle(ev, ch)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t('profile.prefs.save')}
            </Button>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {t(error)}
          </p>
        )}
        {info && !error && <p className="text-sm text-muted-foreground">{t(info)}</p>}
      </CardContent>
    </Card>
  )
}
