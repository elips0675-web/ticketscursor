import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, MessageSquare, Send } from 'lucide-react'
import { api } from '@/lib/api'

interface TicketData {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  category: string
  created_at: string
  updated_at: string
  requester: string
  messages: { id: number; sender: string; text: string; created_at: string; attachments: string[] }[]
}

export default function PortalTrack() {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [error, setError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)

  const track = async () => {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    setTicket(null)
    try {
      const d = await api.get(`/portal/track/${token.trim()}`)
      setTicket(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('portal.trackError'))
    }
    setLoading(false)
  }

  const reply = async () => {
    if (!replyText.trim() || !ticket) return
    setReplying(true)
    try {
      const d = await api.post(`/portal/track/${token.trim()}/reply`, { text: replyText.trim() })
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                { id: d.id, sender: 'Portal User', text: d.text, created_at: d.created_at, attachments: [] },
              ],
              updated_at: d.created_at,
            }
          : null,
      )
      setReplyText('')
      toast.success(t('portal.replySent'))
    } catch {
      toast.error(t('common.error'))
    }
    setReplying(false)
  }

  const statusColor: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    closed: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t('portal.trackTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('portal.trackSubtitle')}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t('portal.trackPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && track()}
                className="flex-1"
              />
              <Button onClick={track} disabled={loading || !token.trim()} className="shrink-0 gap-1.5">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t('portal.trackBtn')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg p-3 text-center">
            {error}
          </div>
        )}

        {ticket && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  #{ticket.id} — {ticket.title}
                </CardTitle>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[ticket.status] || 'bg-muted'}`}
                >
                  {ticket.status}
                </span>
              </div>
              <CardDescription>
                {t('portal.requester')}: {ticket.requester} · {t('portal.priority')}: {ticket.priority} ·{' '}
                {new Date(ticket.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.description && <div className="rounded-lg bg-muted p-3 text-sm">{ticket.description}</div>}

              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" /> {t('portal.messages')} ({ticket.messages.length})
                </h3>
                {ticket.messages.map((msg) => (
                  <div key={msg.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{msg.sender}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <Label className="text-xs font-bold">{t('portal.reply')}</Label>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="mt-1"
                  placeholder={t('portal.replyPlaceholder')}
                  rows={3}
                />
                <Button onClick={reply} disabled={replying || !replyText.trim()} className="mt-2 gap-1.5">
                  {replying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {t('portal.sendReply')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
