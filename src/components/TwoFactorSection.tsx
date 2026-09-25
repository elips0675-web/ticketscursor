import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Loader2, KeyRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFeature } from '@/hooks/useFeature'
import { API_URL } from '@/lib/api'
import QRCode from 'qrcode'

interface TwoFaStatus {
  enabled: boolean
  secretSet: boolean
  required: boolean
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

export default function TwoFactorSection() {
  const { t } = useTranslation()
  const { token, user, isAdmin } = useAuth()
  const flagOn = useFeature('two_fa')

  const [status, setStatus] = useState<TwoFaStatus | null>(null)
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!flagOn || !isAdmin || !token) return
    let cancelled = false
    apiJson<TwoFaStatus>('/auth/2fa/status', token)
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [flagOn, isAdmin, token])

  if (!flagOn || !isAdmin) return null

  const startSetup = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await apiJson<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', token, { method: 'POST' })
      setSetup(data)
      setCode('')
      try {
        const url = await QRCode.toDataURL(data.otpauthUrl, { width: 220, margin: 1 })
        setQrDataUrl(url)
      } catch {
        setQrDataUrl('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async () => {
    if (code.length < 6) return
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (status?.enabled) {
        await apiJson('/auth/2fa/disable', token, { method: 'POST', body: JSON.stringify({ code }) })
        setStatus({ ...status, enabled: false })
        setCode('')
        setInfo(t('profile.twoFactorDisabled'))
      } else {
        const data = await apiJson<{ enabled: boolean }>('/auth/2fa/enable', token, {
          method: 'POST',
          body: JSON.stringify({ code }),
        })
        setStatus({ enabled: data.enabled, secretSet: true, required: status?.required || false })
        setSetup(null)
        setQrDataUrl('')
        setCode('')
        setInfo(t('profile.twoFactorEnabled'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          {t('profile.twoFactor')}
        </CardTitle>
        <CardDescription className="text-xs">{t('profile.twoFactorDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.enabled ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="w-3 h-3" /> {t('profile.twoFactorOn')}
              </Badge>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="2fa-disable-code" className="text-sm font-bold">
                {t('profile.twoFactorCode')}
              </label>
              <div className="flex gap-2">
                <Input
                  id="2fa-disable-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="max-w-[160px]"
                />
                <Button variant="outline" onClick={submitCode} disabled={busy || code.length < 6}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profile.disable2fa')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {!setup ? (
              <Button onClick={startSetup} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {t('profile.setup2fa')}
              </Button>
            ) : (
              <div className="space-y-4">
                {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-[220px] h-[220px] border rounded-lg" /> : null}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('profile.twoFactorSecret')}</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded break-all">{setup.secret}</code>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="2fa-enable-code" className="text-sm font-bold">
                    {t('profile.twoFactorCode')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="2fa-enable-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="max-w-[160px]"
                    />
                    <Button onClick={submitCode} disabled={busy || code.length < 6}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profile.enable2fa')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
