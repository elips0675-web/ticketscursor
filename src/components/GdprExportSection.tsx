import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Loader2, FileJson } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFeature } from '@/hooks/useFeature'
import { API_URL } from '@/lib/api'

export default function GdprExportSection() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const flagOn = useFeature('gdpr_export')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  if (!flagOn) return null

  const exportData = async () => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`${API_URL}/gdpr/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { message?: string }).message || 'Request failed')
      }
      const json = (await res.json()) as { data: unknown }
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gdpr-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setInfo(t('profile.gdprDone'))
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
          <FileJson className="w-4 h-4 text-primary" />
          {t('profile.gdprTitle')}
        </CardTitle>
        <CardDescription className="text-xs">{t('profile.gdprDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('profile.gdprHint')}</p>
          <Button variant="outline" size="sm" onClick={exportData} disabled={busy} className="shrink-0 gap-1">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {t('profile.gdprDownload')}
          </Button>
        </div>
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
