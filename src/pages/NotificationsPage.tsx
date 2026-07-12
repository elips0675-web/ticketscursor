import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Bell, Search, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { api } from '@/lib/api'

const TYPE_LABELS: Record<string, string> = {
  ticket_created: 'Тикет',
  ticket_assigned: 'Назначение',
  chat_message: 'Чат',
  event: 'Событие',
  system: 'Системное',
}

const TYPE_COLORS: Record<string, string> = {
  ticket_created: 'bg-blue-500/10 text-blue-600',
  ticket_assigned: 'bg-purple-500/10 text-purple-600',
  chat_message: 'bg-green-500/10 text-green-600',
  event: 'bg-amber-500/10 text-amber-600',
  system: 'bg-gray-500/10 text-gray-600',
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    api
      .get('/notifications')
      .then((data) => {
        setNotifications(data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const markRead = async (id: number) => {
    await api.put(`/notifications/${id}/read`)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)))
  }

  const markAllRead = async () => {
    await api.put('/notifications/read-all')
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
  }

  const clearAll = async () => {
    await api.delete('/notifications/clear-all')
    setNotifications([])
  }

  const types = [...new Set(notifications.map((n) => n.type))]

  const filtered = notifications.filter((n) => {
    if (filter === 'unread' && n.is_read) return false
    if (typeFilter && n.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!n.title.toLowerCase().includes(q) && !(n.body || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('notifications.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {notifications.filter((n) => !n.is_read).length} {t('notifications.unread')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markAllRead}>
            {t('notifications.markAllRead')}
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            {t('notifications.clearAll')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('notifications.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
          <TabsList>
            <TabsTrigger value="all">{t('notifications.all')}</TabsTrigger>
            <TabsTrigger value="unread">{t('notifications.unreadOnly')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {types.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <Button
            key="all"
            variant={typeFilter === '' ? 'default' : 'secondary'}
            size="sm"
            className="text-xs"
            onClick={() => setTypeFilter('')}
          >
            {t('common.all')}
          </Button>
          {types.map((type) => (
            <Button
              key={type}
              variant={typeFilter === type ? 'default' : 'secondary'}
              size="sm"
              className="text-xs"
              onClick={() => setTypeFilter(type)}
            >
              {TYPE_LABELS[type] || type}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <Bell className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">{t('notifications.noData')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card
              key={n.id}
              className={`hover:shadow-sm transition-shadow ${!n.is_read ? 'border-l-2 border-l-primary' : ''}`}
            >
              <div className="flex items-start gap-4 p-4">
                <Badge variant="secondary" className={TYPE_COLORS[n.type] || ''}>
                  {TYPE_LABELS[n.type] || n.type}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!n.is_read ? 'font-bold' : ''}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground/50 mt-1">{formatDate(n.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {n.link && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => {
                        markRead(n.id)
                        navigate(n.link)
                      }}
                      aria-label={t('common.open')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => markRead(n.id)}
                      aria-label={t('notifications.markRead')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
