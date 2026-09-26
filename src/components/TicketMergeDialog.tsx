import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, GitMerge, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import type { TicketMergeResult } from '@/types'

/**
 * Этап 64 (подфича 3): «Создать копию» / «Объединить с…» (перенос сообщений/вложений).
 * Доступно только admin/senior_agent (canManage). Duplicate — сразу действие; merge — ввод id целевого тикета.
 */
export default function TicketMergeDialog({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState<'duplicate' | 'merge' | null>(null)

  const duplicate = async () => {
    setBusy('duplicate')
    try {
      const data = await api.post<TicketMergeResult>(`/tickets/${ticketId}/duplicate`)
      toast.success(t('tickets.mergeDuplicated', { id: data?.id ?? '' }))
    } catch {
      toast.error(t('tickets.mergeError'))
    } finally {
      setBusy(null)
    }
  }

  const merge = async () => {
    const targetTicketId = Number(targetId)
    if (!targetTicketId) {
      toast.error(t('tickets.mergeInvalidId'))
      return
    }
    setBusy('merge')
    try {
      const data = await api.post<TicketMergeResult>(`/tickets/${ticketId}/merge`, { targetTicketId })
      toast.success(
        t('tickets.mergeDone', {
          count: data?.movedMessages ?? 0,
          target: data?.targetTitle ?? targetTicketId,
        }),
      )
      setTargetId('')
      setOpen(false)
    } catch {
      toast.error(t('tickets.mergeError'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card data-testid="ticket-merge-dialog">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-primary" />
          {t('tickets.mergeCard')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={duplicate}
            disabled={busy !== null}
            data-testid="ticket-duplicate"
          >
            {busy === 'duplicate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            {t('tickets.mergeDuplicate')}
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy !== null}
                data-testid="ticket-merge-open"
              >
                <GitMerge className="w-3.5 h-3.5" />
                {t('tickets.mergeTo')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" data-testid="ticket-merge-content">
              <DialogHeader>
                <DialogTitle>{t('tickets.mergeTitle')}</DialogTitle>
                <DialogDescription>{t('tickets.mergeDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="merge-target-id" className="text-xs font-bold">
                  {t('tickets.mergeTargetId')}
                </Label>
                <Input
                  id="merge-target-id"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder={t('tickets.mergeTargetPlaceholder')}
                  inputMode="numeric"
                  className="h-9"
                  data-testid="merge-target-input"
                />
                <p className="text-[10px] text-muted-foreground">{t('tickets.mergeHint')}</p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={busy !== null}
                  data-testid="merge-cancel"
                >
                  {t('common.cancel')}
                </Button>
                <Button onClick={merge} disabled={busy !== null || !Number(targetId)} data-testid="merge-confirm">
                  {busy === 'merge' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitMerge className="w-3.5 h-3.5" />
                  )}
                  {t('tickets.mergeConfirm')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}
