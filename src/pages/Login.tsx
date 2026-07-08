import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { loginSchema, type LoginFormData } from '@/lib/schemas'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuth()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/', { replace: true })
  }, [navigate])

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError('root', { message: json.message || t('auth.loginError') })
        return
      }
      login(json.token, json.employee)
      navigate('/', { replace: true })
    } catch {
      setError('root', { message: t('auth.connectionError') })
    }
  }

  const devLogin = async () => {
    try {
      const res = await fetch('/api/auth/dev-login', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        login(data.token, data.employee)
        navigate('/', { replace: true })
        return
      }
    } catch {
      // backend недоступен — демо-режим
    }
    const demoUser = { id: 1, name: 'Администратор', email: 'admin@company.ru', role: 'admin' as const }
    login('demo-token', demoUser)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <span className="text-white font-bold text-lg">SD</span>
          </div>
          <CardTitle>Service Desk</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {errors.root && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium" role="alert">
                {errors.root.message}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-bold">
                {t('auth.email')}
              </label>
              <Input id="login-email" type="email" {...register('email')} placeholder="ivan@company.ru" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-bold">
                {t('auth.password')}
              </label>
              <Input
                id="login-password"
                type="password"
                {...register('password')}
                placeholder={t('auth.passwordPlaceholder')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider text-center mb-2">
              {t('auth.quickLogin')}
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={devLogin}>
              {t('auth.loginAsAdmin')}
            </Button>
          </div>

          <div className="text-center text-sm text-muted-foreground mt-4">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-primary font-bold hover:underline">
              {t('auth.register')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
