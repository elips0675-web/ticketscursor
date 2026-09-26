import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Eye, Loader2, Plus, User, UserMinus, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import type { TicketWatcher } from '@/types'

/**
 * Этап 64 (подфича 1): подписчики (watchers) тикета — кто наблюдает за изменениями.
 * Подписка — любой участник тикета; отписка — сам watcher или senior_agent+.
 */
export default function TicketWatchersCard({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [watchers, setWatchers] = useState<TicketWatcher[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [employeeId, setEmployeeId] = useState('')

  const load = () => {
    api
      .get<TicketWatcher[]>(`/tickets/${ticketId}/watchers`)
      .then((data) => setWatchers(Array.isArray(data) ? data : []))
      .catch(() => setWatchers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  const isWatching = user ? watchers.some((w) => w.id === user.id) : false
  const canRemove = (wid: number) =>
    user && (wid === user.id || user.role === 'admin' || user.role === 'super_admin' || user.role === 'senior_agent')

  const toggleSelf = async () => {
    if (!user) return
    setSubmitting(true)
    try {
      if (isWatching) {
        await api.delete(`/tickets/${ticketId}/watchers/${user.id}`)
        toast.success(t('tickets.watcherRemoved'))
      } else {
        await api.post(`/tickets/${ticketId}/watchers`, { employeeId: user.id })
        toast.success(t('tickets.watcherAdded'))
      }
      load()
    } catch {
      toast.error(t('tickets.watcherError'))
    } finally {
      setSubmitting(false)
    }
  }

  const addWatcher = async () => {
    const id = Number(employeeId)
    if (!id) {
      toast.error(t('tickets.watcherInvalidId'))
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/tickets/${ticketId}/watchers`, { employeeId: id })
      toast.success(t('tickets.watcherAdded'))
      setEmployeeId('')
      load()
    } catch {
      toast.error(t('tickets.watcherError'))
    } finally {
      setSubmitting(false)
    }
  }

  const removeWatcher = async (wid: number) => {
    try {
      await api.delete(`/tickets/${ticketId}/watchers/${wid}`)
      toast.success(t('tickets.watcherRemoved'))
      load()
    } catch {
      toast.error(t('tickets.watcherError'))
    }
  }

  return (
    <Card data-testid="ticket-watchers-card">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          {t('tickets.watchers')}
          <span className="text-xs text-muted-foreground">({watchers.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="watchers-loading">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('common.loading')}
          </div>
        ) : watchers.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="watchers-empty">
            {t('tickets.watchersEmpty')}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="watchers-list">
            {watchers.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-[9px]">{w.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{w.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{w.email}</p>
                </div>
                {canRemove(w.id) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeWatcher(w.id)}
                    aria-label={t('tickets.watcherRemove')}
                    data-testid={`watcher-remove-${w.id}`}
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <Button
          variant={isWatching ? 'outline' : 'default'}
          size="sm"
          className="w-full gap-1.5"
          onClick={toggleSelf}
          disabled={submitting || !user}
          data-testid="watcher-toggle-self"
        >
          {submitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isWatching ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          {isWatching ? t('tickets.watcherUnsubscribe') : t('tickets.watcherSubscribe')}
        </Button>

        {user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'senior_agent') && (
          <div className="flex gap-2">
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder={t('tickets.watcherEmployeeId')}
              className="h-8 text-xs"
              inputMode="numeric"
              data-testid="watcher-employee-id"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={addWatcher}
              disabled={submitting || !employeeId}
              data-testid="watcher-add"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
              {t('tickets.watcherAdd')}
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <User className="w-3 h-3" />
          {t('tickets.watchersHint')}
        </p>
      </CardContent>
    </Card>
  )
}
