import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Shield } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

export function SSOLogin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/auth/sso/config')
      .then((d: { data: { enabled: boolean } }) => {
        if (!d.data?.enabled) {
          setError('SSO is not configured')
        }
      })
      .catch(() => setError('Failed to load SSO config'))
  }, [])

  const startSSO = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api.get('/auth/sso/login')
      if (d.data?.url) {
        window.location.href = d.data.url
      } else {
        setError('Failed to generate SSO URL')
        setLoading(false)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'SSO login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-lg">{t('sso.loginTitle')}</CardTitle>
          <CardDescription>{t('sso.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg p-3 text-center">
              {error}
            </div>
          )}
          <Button onClick={startSSO} disabled={loading} className="w-full gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {loading ? t('sso.redirecting') : t('sso.loginButton')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/login')} className="w-full text-sm">
            {t('sso.backToLogin')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function SSOCallback() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const ssoError = searchParams.get('error')

    if (ssoError) {
      setError(`SSO error: ${searchParams.get('error_description') || ssoError}`)
      setLoading(false)
      return
    }

    if (!code || !state) {
      setError('Missing authorization code')
      setLoading(false)
      return
    }

    api
      .post('/auth/sso/callback', { code, state })
      .then((d: { data: { token: string; employee: { id: number; name: string; email: string; role: string } } }) => {
        if (d.data?.token) {
          login(d.data.token)
          navigate('/')
        } else {
          setError('No token received')
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'SSO authentication failed')
        setLoading(false)
      })
  }, [searchParams, login, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">{t('sso.processing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">{t('sso.errorTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg p-3 text-center">
            {error}
          </div>
          <Button onClick={() => navigate('/login')} className="w-full">
            {t('sso.backToLogin')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
