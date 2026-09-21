import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Lock, Loader2, CheckCircle } from 'lucide-react'
import { useSearchParams, Link } from 'react-router-dom'
import { API_URL } from '@/lib/api'

export default function ResetPassword() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (password !== confirm) {
      setError(t('auth.passwordsNoMatch'))
      return
    }
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) setDone(true)
      else {
        const d = await res.json()
        setError(d.message || t('common.error'))
      }
    } catch {
      setError(t('auth.connectionError'))
    }
    setLoading(false)
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>{t('auth.resetPasswordInvalidLink')}</CardTitle>
            <CardDescription>{t('auth.resetPasswordInvalidLinkDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <CardTitle>{t('auth.resetPasswordSuccess')}</CardTitle>
            <CardDescription>{t('auth.resetPasswordSuccessDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login" className="text-sm text-primary hover:underline">
              {t('auth.goToLogin')}
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t('auth.resetPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.resetPasswordDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.newPasswordPlaceholder')}
              className="pl-9"
              type="password"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              className="pl-9"
              type="password"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={submit} disabled={loading || !password.trim() || !confirm.trim()} className="w-full gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('auth.resetPasswordBtn')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
