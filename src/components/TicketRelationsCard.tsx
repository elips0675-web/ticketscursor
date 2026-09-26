import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { GitBranch, Loader2, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import type { TicketRelation, TicketRelationType } from '@/types'

/**
 * Этап 64 (подфича 2): связи тикета (parent/child, blocked_by, duplicate, related).
 * Список показывает обе стороны (direction in/out); добавление — по id парного тикета.
 */
export default function TicketRelationsCard({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation()
  const [relations, setRelations] = useState<TicketRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [relatedId, setRelatedId] = useState('')
  const [type, setType] = useState<TicketRelationType>('related')

  const load = () => {
    api
      .get<TicketRelation[]>(`/tickets/${ticketId}/relations`)
      .then((data) => setRelations(Array.isArray(data) ? data : []))
      .catch(() => setRelations([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  const addRelation = async () => {
    const relatedTicketId = Number(relatedId)
    if (!relatedTicketId) {
      toast.error(t('tickets.relationInvalidId'))
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/tickets/${ticketId}/relations`, { relatedTicketId, type })
      toast.success(t('tickets.relationAdded'))
      setRelatedId('')
      load()
    } catch {
      toast.error(t('tickets.relationError'))
    } finally {
      setSubmitting(false)
    }
  }

  const removeRelation = async (relationId: number) => {
    try {
      await api.delete(`/tickets/${ticketId}/relations/${relationId}`)
      toast.success(t('tickets.relationRemoved'))
      load()
    } catch {
      toast.error(t('tickets.relationError'))
    }
  }

  const typeLabel = (v: string) =>
    ({
      parent: t('tickets.relationParent'),
      child: t('tickets.relationChild'),
      blocked_by: t('tickets.relationBlockedBy'),
      duplicate: t('tickets.relationDuplicate'),
      related: t('tickets.relationRelated'),
    })[v] || v

  return (
    <Card data-testid="ticket-relations-card">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          {t('tickets.relations')}
          <span className="text-xs text-muted-foreground">({relations.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="relations-loading">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('common.loading')}
          </div>
        ) : relations.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="relations-empty">
            {t('tickets.relationsEmpty')}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="relations-list">
            {relations.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[9px] shrink-0">
                  {typeLabel(r.type)}
                </Badge>
                <Link
                  to={`/tickets/${r.other_ticket.id}`}
                  className="flex-1 min-w-0 text-sm font-medium truncate hover:text-primary transition-colors"
                  data-testid={`relation-link-${r.other_ticket.id}`}
                >
                  #{r.other_ticket.id} · {r.other_ticket.title}
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => removeRelation(r.id)}
                  aria-label={t('tickets.relationRemove')}
                  data-testid={`relation-remove-${r.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={type} onValueChange={(v) => setType(v as TicketRelationType)}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="relation-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">{t('tickets.relationParent')}</SelectItem>
                <SelectItem value="child">{t('tickets.relationChild')}</SelectItem>
                <SelectItem value="blocked_by">{t('tickets.relationBlockedBy')}</SelectItem>
                <SelectItem value="duplicate">{t('tickets.relationDuplicate')}</SelectItem>
                <SelectItem value="related">{t('tickets.relationRelated')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={relatedId}
              onChange={(e) => setRelatedId(e.target.value)}
              placeholder={t('tickets.relationTicketId')}
              className="h-8 text-xs flex-1"
              inputMode="numeric"
              data-testid="relation-ticket-id"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            onClick={addRelation}
            disabled={submitting || !relatedId}
            data-testid="relation-add"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {t('tickets.relationAdd')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
