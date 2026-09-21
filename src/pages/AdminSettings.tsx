import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  Save,
  Loader2,
  Eye,
  EyeOff,
  Database,
  Server,
  FileText,
  Search,
  RefreshCw,
  Flag,
  ToggleLeft,
  Mail,
  Inbox,
  CheckCircle2,
  XCircle,
  Key,
  Shield,
  Globe,
} from 'lucide-react'
import { api } from '@/lib/api'
import { ApiTokensSection, WebhooksSection } from './AdminIntegrations'

const FIELDS = [
  { key: 'COMPANY_NAME', label: 'companyName', type: 'text', section: 'companySettings' },
  { key: 'COMPANY_LOGO', label: 'companyLogo', type: 'text', section: 'companySettings' },
  { key: 'TIMEZONE', label: 'timezone', type: 'text', section: 'companySettings' },
  { key: 'DEFAULT_LANGUAGE', label: 'defaultLanguage', type: 'text', section: 'companySettings' },
  { key: 'AUTO_ASSIGN', label: 'autoAssign', type: 'text', section: 'ticketSettings' },
  { key: 'SLA_RESPONSE_HOURS', label: 'slaResponseHours', type: 'text', section: 'ticketSettings' },
  { key: 'SLA_ESCALATION_ENABLED', label: 'slaEscalationEnabled', type: 'text', section: 'ticketSettings' },
  { key: 'SLA_ESCALATION_HOURS', label: 'slaEscalationHours', type: 'text', section: 'ticketSettings' },
  { key: 'TELEGRAM_BOT_TOKEN', label: 'telegramToken', type: 'password', section: 'telegramSettings' },
  { key: 'SMTP_HOST', label: 'smtpHost', type: 'text', section: 'emailSettings' },
  { key: 'SMTP_PORT', label: 'smtpPort', type: 'text', section: 'emailSettings' },
  { key: 'SMTP_SECURE', label: 'smtpSecure', type: 'text', section: 'emailSettings' },
  { key: 'SMTP_USER', label: 'smtpUser', type: 'text', section: 'emailSettings' },
  { key: 'SMTP_PASS', label: 'smtpPass', type: 'password', section: 'emailSettings' },
  { key: 'SMTP_FROM', label: 'smtpFrom', type: 'text', section: 'emailSettings' },
  { key: 'LDAP_URL', label: 'ldapUrl', type: 'text', section: 'ldapSettings' },
  { key: 'LDAP_BASE_DN', label: 'ldapBaseDn', type: 'text', section: 'ldapSettings' },
  { key: 'LDAP_BIND_DN', label: 'ldapBindDn', type: 'text', section: 'ldapSettings' },
  { key: 'LDAP_BIND_CREDENTIALS', label: 'ldapBindCredentials', type: 'password', section: 'ldapSettings' },
]

export default function AdminSettings() {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState<Record<string, boolean>>({})

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((data) => {
        setValues(data || {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/settings', values)
      toast.success(t('admin.saveSuccess'))
    } catch {
      /* toast handled by api client */
    }
    setSaving(false)
  }

  const sections = [...new Set(FIELDS.map((f) => f.section))]

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.settings')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('admin.settingsSubtitle')}</p>
      </div>

      {sections.map((section) => (
        <Card key={section}>
          <CardHeader>
            <CardTitle className="text-sm">{t(`admin.${section}`)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.filter((f) => f.section === section).map((f) => (
              <div key={f.key}>
                <Label htmlFor={f.key} className="text-xs font-bold">
                  {t(`admin.${f.label}`)}
                </Label>
                <div className="relative mt-1">
                  <Input
                    id={f.key}
                    type={f.type === 'password' && !show[f.key] ? 'password' : 'text'}
                    value={values[f.key] || ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="pr-8"
                  />
                  {f.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShow((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {show[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            {t('admin.operations')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t('admin.redisTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('admin.redisDesc')}</p>
              </div>
            </div>
            <RedisStatus />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t('admin.backupTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('admin.backupDesc')}</p>
              </div>
            </div>
            <ActionButton
              action="backup"
              label={t('admin.backupBtn')}
              runningLabel={t('admin.backupRunning')}
              doneLabel={t('admin.backupDone')}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t('admin.seedTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('admin.seedDesc')}</p>
              </div>
            </div>
            <ActionButton
              action="seed"
              label={t('admin.seedBtn')}
              runningLabel={t('admin.seedRunning')}
              doneLabel={t('admin.seedDone')}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Search className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t('admin.geoTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('admin.geoDesc')}</p>
              </div>
            </div>
            <ActionButton
              action="geo"
              label={t('admin.geoBtn')}
              runningLabel={t('admin.geoRunning')}
              doneLabel={t('admin.geoDone')}
            />
          </div>
        </CardContent>
      </Card>

      <FeatureFlagsSection />

      <EmailTemplatesSection />

      <ImapSection />

      <SSOSection />

      <ApiTokensSection />

      <WebhooksSection />

      <Button onClick={save} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? t('common.loading') : t('common.save')}
      </Button>
    </div>
  )
}

function RedisStatus() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showInput, setShowInput] = useState(false)
  const [inputUrl, setInputUrl] = useState('')

  useEffect(() => {
    api
      .get('/admin/settings/redis-status')
      .then((d: any) => {
        if (d) {
          setUrl(d.url || '')
          setConnected(d.connected)
          setInputUrl(d.url || '')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const saveUrl = async () => {
    await api.put('/admin/settings/redis', { url: inputUrl })
    setUrl(inputUrl)
    setConnected(false)
    setShowInput(false)
    toast.success(t('admin.saveSuccess'))
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />

  return (
    <div className="flex items-center gap-2 shrink-0">
      {showInput ? (
        <div className="flex items-center gap-2">
          <Input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={t('admin.redisEnterUrl')}
            className="w-44 h-8 text-xs"
          />
          <Button size="sm" variant="default" onClick={saveUrl} className="h-8 text-xs">
            {t('admin.redisSave')}
          </Button>
        </div>
      ) : (
        <>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${connected ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}
          >
            {connected ? t('admin.redisOn') : t('admin.redisOff')}
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowInput(true)} className="h-7 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />
            {url ? t('common.edit') : t('common.add')}
          </Button>
        </>
      )}
    </div>
  )
}

const EMAIL_TEMPLATE_KEYS = [
  {
    key: 'ticketCreatedSubject',
    label: 'Тема (создание тикета)',
    variables: ['ticketId', 'ticketTitle', 'priority', 'companyName', 'userName'],
  },
  {
    key: 'ticketCreatedBody',
    label: 'Тело (создание тикета)',
    variables: ['ticketId', 'ticketTitle', 'priority', 'companyName', 'userName'],
    multiline: true,
  },
  {
    key: 'ticketStatusSubject',
    label: 'Тема (изменение статуса)',
    variables: ['ticketId', 'ticketTitle', 'oldStatus', 'newStatus', 'companyName', 'userName'],
  },
  {
    key: 'ticketStatusBody',
    label: 'Тело (изменение статуса)',
    variables: ['ticketId', 'ticketTitle', 'oldStatus', 'newStatus', 'companyName', 'userName'],
    multiline: true,
  },
  {
    key: 'ticketAssignedSubject',
    label: 'Тема (назначение тикета)',
    variables: ['ticketId', 'ticketTitle', 'status', 'priority', 'companyName', 'userName'],
  },
  {
    key: 'ticketAssignedBody',
    label: 'Тело (назначение тикета)',
    variables: ['ticketId', 'ticketTitle', 'status', 'priority', 'companyName', 'userName'],
    multiline: true,
  },
  {
    key: 'slaBreachedSubject',
    label: 'Тема (просрочка SLA)',
    variables: ['ticketId', 'ticketTitle', 'dueAt', 'companyName'],
  },
  {
    key: 'slaBreachedBody',
    label: 'Тело (просрочка SLA)',
    variables: ['ticketId', 'ticketTitle', 'dueAt', 'companyName'],
    multiline: true,
  },
]

const DEFAULT_EMAIL_TEMPLATES: Record<string, string> = {
  ticketCreatedSubject: 'Тикет #{{ticketId}} создан: {{ticketTitle}}',
  ticketCreatedBody:
    'Ваш тикет "{{ticketTitle}}" (#{{ticketId}}) создан.\nСтатус: Открыт\nПриоритет: {{priority}}\n\n{{companyName}}',
  ticketStatusSubject: 'Статус тикета #{{ticketId}}: {{newStatus}}',
  ticketStatusBody: 'Тикет "{{ticketTitle}}" (#{{ticketId}})\nСтатус: {{oldStatus}} → {{newStatus}}\n\n{{companyName}}',
  ticketAssignedSubject: 'Тикет #{{ticketId}} назначен на вас: {{ticketTitle}}',
  ticketAssignedBody:
    'Тикет "{{ticketTitle}}" (#{{ticketId}}) назначен на вас.\nСтатус: {{status}}\nПриоритет: {{priority}}\n\n{{companyName}}',
  slaBreachedSubject: 'SLA просрочка: тикет #{{ticketId}}',
  slaBreachedBody:
    'Тикет "{{ticketTitle}}" (#{{ticketId}}) просрочен по SLA.\nСрок реакции истёк: {{dueAt}}\n\n{{companyName}}',
}

function EmailTemplatesSection() {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((data: any) => {
        if (data?.EMAIL_TEMPLATES) {
          try {
            setTemplates({ ...DEFAULT_EMAIL_TEMPLATES, ...JSON.parse(data.EMAIL_TEMPLATES) })
          } catch {
            setTemplates({ ...DEFAULT_EMAIL_TEMPLATES })
          }
        } else {
          setTemplates({ ...DEFAULT_EMAIL_TEMPLATES })
        }
        setLoading(false)
      })
      .catch(() => {
        setTemplates({ ...DEFAULT_EMAIL_TEMPLATES })
        setLoading(false)
      })
  }, [])

  const update = (key: string, value: string) => {
    setTemplates((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      for (const { key } of EMAIL_TEMPLATE_KEYS) {
        payload[key] = templates[key] || ''
      }
      await api.put('/admin/settings', { EMAIL_TEMPLATES: JSON.stringify(payload) })
      toast.success(t('admin.saveSuccess'))
    } catch {
      /* ignore */
    }
    setSaving(false)
  }

  const resetDefaults = async () => {
    setTemplates({ ...DEFAULT_EMAIL_TEMPLATES })
    try {
      await api.put('/admin/settings', { EMAIL_TEMPLATES: JSON.stringify(DEFAULT_EMAIL_TEMPLATES) })
      toast.success(t('admin.saveSuccess'))
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            {t('admin.emailTemplates')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          {t('admin.emailTemplates')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.emailTemplatesSubtitle')}</p>
        {EMAIL_TEMPLATE_KEYS.map(({ key, label, variables, multiline }) => (
          <div key={key}>
            <label htmlFor={`et-${key}`} className="text-xs font-bold block mb-1">
              {label}
            </label>
            <div className="flex flex-wrap gap-1 mb-1">
              {variables.map((v) => (
                <code key={v} className="text-[10px] bg-muted px-1 rounded text-muted-foreground">
                  {'{{' + v + '}}'}
                </code>
              ))}
            </div>
            {multiline ? (
              <textarea
                id={`et-${key}`}
                value={templates[key] || ''}
                onChange={(e) => update(key, e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-y"
              />
            ) : (
              <input
                id={`et-${key}`}
                type="text"
                value={templates[key] || ''}
                onChange={(e) => update(key, e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {t('common.save')}
          </Button>
          <Button size="sm" variant="outline" onClick={resetDefaults} className="gap-1.5">
            <RefreshCw className="w-3 h-3" />
            {t('common.reset')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface FeatureFlag {
  key: string
  enabled: boolean
  description: string
}

function ImapSection() {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [testMsg, setTestMsg] = useState('')
  const [configured, setConfigured] = useState(false)
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((data: Record<string, string>) => {
        setValues({
          IMAP_HOST: data?.IMAP_HOST || '',
          IMAP_PORT: data?.IMAP_PORT || '993',
          IMAP_USER: data?.IMAP_USER || '',
          IMAP_PASS: data?.IMAP_PASS || '',
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))

    api
      .get('/admin/imap/status')
      .then((d: { configured: boolean; polling: boolean }) => {
        setConfigured(d.configured)
        setPolling(d.polling)
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/settings', values)
      const s = await api.get('/admin/imap/status')
      setConfigured(s.configured)
      setPolling(s.polling)
      toast.success(t('admin.saveSuccess'))
    } catch {
      /* handled */
    }
    setSaving(false)
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    setTestMsg('')
    try {
      const d = await api.post('/admin/imap/test')
      setTestResult('ok')
      setTestMsg(d.message || t('admin.imapTestOk'))
    } catch (e: unknown) {
      setTestResult('fail')
      setTestMsg(e instanceof Error ? e.message : t('admin.imapTestFail'))
    }
    setTesting(false)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            {t('admin.imapSettings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Inbox className="w-4 h-4 text-primary" />
          {t('admin.imapSettings')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.imapSubtitle')}</p>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          {configured ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-xs font-medium">
              {configured ? t('admin.imapConfigured') : t('admin.imapNotConfigured')}
            </p>
            {configured && (
              <p className="text-[11px] text-muted-foreground">
                {t('admin.imapPolling')}: {polling ? t('admin.imapPollingOn') : t('admin.imapPollingOff')}
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={test} disabled={testing} className="shrink-0 gap-1.5">
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {testing ? t('admin.imapTesting') : t('admin.imapTestBtn')}
          </Button>
        </div>

        {testResult && (
          <div
            className={`text-xs rounded-lg p-2 ${testResult === 'ok' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}
          >
            {testMsg}
          </div>
        )}

        {(
          [
            { key: 'IMAP_HOST', label: t('admin.imapHost'), type: 'text' },
            { key: 'IMAP_PORT', label: t('admin.imapPort'), type: 'text' },
            { key: 'IMAP_USER', label: t('admin.imapUser'), type: 'text' },
            { key: 'IMAP_PASS', label: t('admin.imapPass'), type: 'password' },
          ] as const
        ).map((f) => (
          <div key={f.key}>
            <Label htmlFor={f.key} className="text-xs font-bold">
              {f.label}
            </Label>
            <Input
              id={f.key}
              type={f.type}
              value={values[f.key] || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="mt-1"
            />
          </div>
        ))}

        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  )
}

function SSOSection() {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((data: Record<string, string>) => {
        setValues({
          SSO_ENABLED: data?.SSO_ENABLED || 'false',
          SSO_PROVIDER: data?.SSO_PROVIDER || '',
          SSO_ISSUER_URL: data?.SSO_ISSUER_URL || '',
          SSO_CLIENT_ID: data?.SSO_CLIENT_ID || '',
          SSO_CLIENT_SECRET: data?.SSO_CLIENT_SECRET || '',
          SSO_REDIRECT_URI: data?.SSO_REDIRECT_URI || '',
          SSO_DEFAULT_ROLE: data?.SSO_DEFAULT_ROLE || 'agent',
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/settings', values)
      toast.success(t('admin.saveSuccess'))
    } catch {
      /* handled */
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            {t('admin.ssoSettings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const isEnabled = values.SSO_ENABLED === 'true'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          {t('admin.ssoSettings')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.ssoSubtitle')}</p>

        <div className="flex items-center gap-3">
          <Label className="text-xs font-bold">{t('admin.ssoEnabled')}</Label>
          <button
            type="button"
            onClick={() => setValues((prev) => ({ ...prev, SSO_ENABLED: isEnabled ? 'false' : 'true' }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isEnabled ? 'bg-primary' : 'bg-muted'}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {isEnabled && (
          <>
            <div>
              <Label className="text-xs font-bold">{t('admin.ssoProvider')}</Label>
              <Input
                value={values.SSO_PROVIDER || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, SSO_PROVIDER: e.target.value }))}
                className="mt-1"
                placeholder="Keycloak / Entra ID / Okta / Custom"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.ssoIssuerUrl')}</Label>
              <Input
                value={values.SSO_ISSUER_URL || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, SSO_ISSUER_URL: e.target.value }))}
                className="mt-1"
                placeholder="https://your-idp.com/.well-known/openid-configuration"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.ssoClientId')}</Label>
              <Input
                value={values.SSO_CLIENT_ID || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, SSO_CLIENT_ID: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.ssoClientSecret')}</Label>
              <Input
                type="password"
                value={values.SSO_CLIENT_SECRET || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, SSO_CLIENT_SECRET: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.ssoRedirectUri')}</Label>
              <Input
                value={values.SSO_REDIRECT_URI || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, SSO_REDIRECT_URI: e.target.value }))}
                className="mt-1"
                placeholder="http://localhost:5173/auth/sso/callback"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.ssoDefaultRole')}</Label>
              <select
                value={values.SSO_DEFAULT_ROLE || 'agent'}
                onChange={(e) => setValues((prev) => ({ ...prev, SSO_DEFAULT_ROLE: e.target.value }))}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="requester">{t('roles.requester')}</option>
                <option value="agent">{t('roles.agent')}</option>
                <option value="senior_agent">{t('roles.seniorAgent')}</option>
              </select>
            </div>
          </>
        )}

        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  )
}

function FeatureFlagsSection() {
  const { t } = useTranslation()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    api
      .get('/admin/features')
      .then((data: any) => {
        if (data) setFlags(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = (key: string) => {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)))
    setChanged(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/features', flags)
      toast.success(t('common.saveSuccess'))
      setChanged(false)
    } catch {
      /* ignore */
    }
    setSaving(false)
  }

  const reset = async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/features')
      if (data) setFlags(data)
      setChanged(false)
    } catch {
      /* ignore */
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Flag className="w-4 h-4 text-primary" />
            {t('admin.features')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Flag className="w-4 h-4 text-primary" />
          {t('admin.features')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flags.map((f) => (
          <div key={f.key} className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="flex items-start gap-3">
              <ToggleLeft className={`w-5 h-5 mt-0.5 ${f.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-medium">{f.key}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={f.enabled}
              aria-label={f.key}
              data-testid={`feature-${f.key}`}
              onClick={() => toggle(f.key)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${f.enabled ? 'bg-primary' : 'bg-input'}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${f.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
              />
            </button>
          </div>
        ))}
        {changed && (
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {t('common.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={reset} className="gap-1.5">
              <RefreshCw className="w-3 h-3" />
              {t('common.reset')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActionButton({
  action,
  label,
  runningLabel,
  doneLabel,
}: {
  action: string
  label: string
  runningLabel: string
  doneLabel: string
}) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')

  const run = async () => {
    setState('running')
    try {
      await api.post(`/admin/settings/${action}`)
      setState('done')
      toast.success(doneLabel)
      setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('idle')
    }
  }

  return (
    <Button size="sm" onClick={run} disabled={state === 'running'} className="shrink-0 gap-1.5">
      {state === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
      {state === 'running' ? runningLabel : label}
    </Button>
  )
}
