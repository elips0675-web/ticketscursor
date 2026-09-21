import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader2, Send, CheckCircle2, ExternalLink, Copy } from 'lucide-react'
import { api } from '@/lib/api'

export default function PublicPortal() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ticketId: number; trackingUrl: string } | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    description: '',
    category: 'support',
    priority: 'medium',
  })

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim()) return
    setLoading(true)
    try {
      const d = await api.post('/portal/tickets', form)
      setResult(d)
      toast.success(t('portal.ticketCreated'))
    } catch {
      toast.error(t('common.error'))
    }
    setLoading(false)
  }

  const copyLink = () => {
    if (result?.trackingUrl) {
      navigator.clipboard.writeText(result.trackingUrl)
      toast.success(t('common.copied'))
    }
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle className="text-lg">{t('portal.ticketCreatedTitle')}</CardTitle>
            <CardDescription>{t('portal.ticketCreatedDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('portal.ticketId')}</span>
                <span className="text-sm font-mono">#{result.ticketId}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('portal.trackingUrl')}</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{result.trackingUrl}</code>
                  <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0 gap-1">
                    <Copy className="w-3 h-3" /> {t('common.copy')}
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">{t('portal.trackingHint')}</p>
            <Button
              onClick={() => {
                setResult(null)
                setForm({ name: '', email: '', subject: '', description: '', category: 'support', priority: 'medium' })
              }}
              className="w-full"
            >
              {t('portal.newTicket')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">{t('portal.createTicket')}</CardTitle>
          <CardDescription>{t('portal.createTicketDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs font-bold">{t('portal.name')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="mt-1"
              placeholder="Иван Иванов"
            />
          </div>
          <div>
            <Label className="text-xs font-bold">{t('portal.email')}</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-1"
              placeholder="ivan@company.com"
            />
          </div>
          <div>
            <Label className="text-xs font-bold">{t('portal.subject')}</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              className="mt-1"
              placeholder="Что-то сломалось"
            />
          </div>
          <div>
            <Label className="text-xs font-bold">{t('portal.description')}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="mt-1"
              placeholder="Опишите проблему подробнее..."
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">{t('portal.category')}</Label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="support">Поддержка</option>
                <option value="bug">Баг</option>
                <option value="feature">Запрос</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-bold">{t('portal.priority')}</Label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="critical">Критический</option>
              </select>
            </div>
          </div>
          <Button
            onClick={submit}
            disabled={loading || !form.name.trim() || !form.email.trim() || !form.subject.trim()}
            className="w-full gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? t('common.loading') : t('portal.submit')}
          </Button>
          <div className="text-center">
            <a href="/portal/track" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              {t('portal.trackExisting')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
