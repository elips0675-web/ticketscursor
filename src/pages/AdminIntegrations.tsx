import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Save, Loader2, Trash2, Plus, Key, Webhook, CheckCircle2, XCircle, Copy } from 'lucide-react'
import { api } from '@/lib/api'

interface ApiToken {
  id: number
  name: string
  prefix: string
  scopes: string | null
  expires_at: string | null
  last_used: string | null
  created_at: string | null
}

interface WebhookItem {
  id: number
  name: string
  url: string
  events: string
  is_active: boolean
  last_status: number | null
  last_error: string | null
  last_triggered_at: string | null
  created_at: string | null
}

const AVAILABLE_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.message',
  'ticket.assigned',
  'ticket.closed',
  'employee.created',
  'employee.updated',
]

export function ApiTokensSection() {
  const { t } = useTranslation()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [generatedToken, setGeneratedToken] = useState('')

  useEffect(() => {
    api
      .get('/api-tokens')
      .then((d: ApiToken[]) => {
        setTokens(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await api.post('/api-tokens', { name: newName.trim() })
      setGeneratedToken(res.token)
      setTokens((prev) => [
        {
          id: res.id,
          name: res.name,
          prefix: res.prefix,
          scopes: res.scopes,
          expires_at: res.expires_at,
          last_used: null,
          created_at: res.created_at,
        },
        ...prev,
      ])
      setNewName('')
    } catch {
      toast.error(t('common.error'))
    }
    setCreating(false)
  }

  const remove = async (id: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return
    try {
      await api.delete(`/api-tokens/${id}`)
      setTokens((prev) => prev.filter((t) => t.id !== id))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const copyToken = () => {
    navigator.clipboard.writeText(generatedToken)
    toast.success('Token copied')
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            {t('admin.apiTokens')}
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
          <Key className="w-4 h-4 text-primary" />
          {t('admin.apiTokens')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.apiTokensSubtitle')}</p>

        {generatedToken && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
            <p className="text-xs font-medium text-green-700 dark:text-green-400">{t('admin.apiTokenWarning')}</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white dark:bg-black/30 px-2 py-1 rounded flex-1 overflow-auto">
                {generatedToken}
              </code>
              <Button size="sm" variant="outline" onClick={copyToken} className="shrink-0 gap-1">
                <Copy className="w-3 h-3" /> {t('common.copy')}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            placeholder={t('admin.apiTokenName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            className="flex-1"
          />
          <Button size="sm" onClick={create} disabled={creating || !newName.trim()} className="shrink-0 gap-1.5">
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            {t('common.create')}
          </Button>
        </div>

        {tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('admin.apiTokensEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{token.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {token.prefix}••••
                    {token.last_used &&
                      ` · ${t('admin.apiTokenLastUsed')}: ${new Date(token.last_used).toLocaleDateString()}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(token.id)}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function WebhooksSection() {
  const { t } = useTranslation()
  const [hooks, setHooks] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: [] as string[] })

  useEffect(() => {
    api
      .get('/webhooks')
      .then((d: WebhookItem[]) => {
        setHooks(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }))
  }

  const create = async () => {
    if (!form.name.trim() || !form.url.trim() || form.events.length === 0) return
    setSaving(true)
    try {
      const hook = await api.post('/webhooks', form)
      setHooks((prev) => [hook, ...prev])
      setForm({ name: '', url: '', secret: '', events: [] })
      setShowForm(false)
    } catch {
      toast.error(t('common.error'))
    }
    setSaving(false)
  }

  const toggleActive = async (hook: WebhookItem) => {
    try {
      await api.put(`/webhooks/${hook.id}`, { is_active: !hook.is_active })
      setHooks((prev) => prev.map((h) => (h.id === hook.id ? { ...h, is_active: !h.is_active } : h)))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return
    try {
      await api.delete(`/webhooks/${id}`)
      setHooks((prev) => prev.filter((h) => h.id !== id))
    } catch {
      toast.error(t('common.error'))
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Webhook className="w-4 h-4 text-primary" />
            {t('admin.webhooks')}
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
          <Webhook className="w-4 h-4 text-primary" />
          {t('admin.webhooks')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.webhooksSubtitle')}</p>

        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
          <Plus className="w-3 h-3" />
          {showForm ? t('common.cancel') : t('admin.webhookCreate')}
        </Button>

        {showForm && (
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <Label className="text-xs font-bold">{t('admin.webhookName')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1"
                placeholder="Slack notifications"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.webhookUrl')}</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="mt-1"
                placeholder="https://hooks.slack.com/..."
              />
            </div>
            <div>
              <Label className="text-xs font-bold">
                {t('admin.webhookSecret')} ({t('common.cancel').toLowerCase()})
              </Label>
              <Input
                value={form.secret}
                onChange={(e) => setForm((p) => ({ ...p, secret: e.target.value }))}
                className="mt-1"
                placeholder="HMAC secret"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{t('admin.webhookEvents')}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {AVAILABLE_EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={form.events.includes(event)} onCheckedChange={() => toggleEvent(event)} />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={create} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {t('common.save')}
            </Button>
          </div>
        )}

        {hooks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('admin.webhooksEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {hooks.map((hook) => (
              <div key={hook.id} className="rounded-lg border px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hook.is_active ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{hook.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(hook)} className="text-xs h-7">
                      {hook.is_active ? t('common.disable') : t('common.enable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(hook.id)}
                      className="text-destructive hover:text-destructive h-7"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">{hook.url}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{hook.events.split(',').join(', ')}</span>
                  {hook.last_status && <span>· {hook.last_status}</span>}
                  {hook.last_error && <span className="text-red-500">· {hook.last_error}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
