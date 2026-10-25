import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Loader2, MessageCircle, RotateCcw, Search, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatRelativeTime, formatTime } from '@/lib/utils'
import RichMessage from '@/components/chat/RichMessage'
import type { RichPayload } from '@/types'

type WidgetStatus = 'open' | 'closed'

interface WidgetInboxMessage {
  id: number
  sender_type: 'visitor' | 'agent'
  sender_name: string
  text: string
  content_type?: 'text' | 'rich_json'
  rich_payload?: RichPayload | null
  created_at: string
}

interface WidgetConversationSummary {
  id: number
  channel: string
  visitor_name: string
  visitor_email: string | null
  status: WidgetStatus
  unread_for_agent: number
  last_message_at: string
  created_at: string
  last_message: WidgetInboxMessage | null
}

interface WidgetConversationDetail extends WidgetConversationSummary {
  visitor_id: string
  messages: WidgetInboxMessage[]
}

const POLL_INTERVAL_MS = 5000
const MAX_TEXT = 4000

export default function WidgetInbox() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<WidgetStatus>('open')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reply, setReply] = useState('')
  const [actionError, setActionError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const listQuery = useQuery({
    queryKey: ['widget-inbox', status, search],
    queryFn: () =>
      api.get<WidgetConversationSummary[]>(
        `/widget-inbox/conversations?status=${status}&q=${encodeURIComponent(search.trim())}`,
      ),
    refetchInterval: POLL_INTERVAL_MS,
  })

  const detailQuery = useQuery({
    queryKey: ['widget-inbox', 'conversation', selectedId],
    queryFn: () => api.get<WidgetConversationDetail>(`/widget-inbox/conversations/${selectedId}`),
    enabled: selectedId !== null,
    refetchInterval: selectedId === null ? false : POLL_INTERVAL_MS,
  })

  const conversations = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const conversation = detailQuery.data ?? null

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['widget-inbox'] })
  }

  const readMutation = useMutation({
    mutationFn: (id: number) => api.post(`/widget-inbox/conversations/${id}/read`),
    onSuccess: invalidate,
  })

  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      api.post(`/widget-inbox/conversations/${id}/messages`, { text }),
    onSuccess: () => {
      setReply('')
      setActionError('')
      toast.success(t('widget.inbox.sent'))
      invalidate()
    },
    onError: () => setActionError('widget.inbox.replyError'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: WidgetStatus }) =>
      api.post(`/widget-inbox/conversations/${id}/${next === 'closed' ? 'close' : 'reopen'}`),
    onSuccess: () => {
      setActionError('')
      invalidate()
    },
    onError: () => setActionError('widget.inbox.replyError'),
  })

  useEffect(() => {
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [conversation?.messages.length, selectedId])

  const openConversation = (item: WidgetConversationSummary) => {
    setSelectedId(item.id)
    setReply('')
    setActionError('')
    if (item.unread_for_agent > 0) readMutation.mutate(item.id)
  }

  const closeConversation = () => {
    if (selectedId === null) return
    statusMutation.mutate({ id: selectedId, next: 'closed' })
  }

  const reopenConversation = () => {
    if (selectedId === null) return
    statusMutation.mutate({ id: selectedId, next: 'open' })
  }

  const sendReply = () => {
    const text = reply.trim()
    if (!text || selectedId === null || replyMutation.isPending) return
    replyMutation.mutate({ id: selectedId, text })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendReply()
    }
  }

  const listError = listQuery.isError
  const detailError = detailQuery.isError

  return (
    <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
      <section
        className={cn(
          'flex min-h-[420px] flex-col rounded-xl border border-border bg-card',
          selectedId !== null && 'hidden md:flex',
        )}
        aria-label={t('widget.inbox.title')}
      >
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label={t('widget.inbox.title')}>
            {(['open', 'closed'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStatus(value)
                  setSelectedId(null)
                }}
                aria-pressed={status === value}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
                  status === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(value === 'open' ? 'widget.inbox.open' : 'widget.inbox.closed')}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('widget.inbox.searchPlaceholder')}
              aria-label={t('widget.inbox.searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {listQuery.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {listError && (
            <div className="px-3 py-8 text-center" role="alert">
              <p className="text-sm font-medium">{t('widget.inbox.loadError')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void listQuery.refetch()}>
                {t('widget.inbox.retry')}
              </Button>
            </div>
          )}

          {!listQuery.isLoading && !listError && conversations.length === 0 && (
            <div className="px-3 py-10 text-center" role="status">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm font-bold">{t('widget.inbox.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('widget.inbox.emptyHint')}</p>
            </div>
          )}

          <div className="space-y-0.5">
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openConversation(item)}
                aria-current={selectedId === item.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors',
                  selectedId === item.id ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{item.visitor_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(item.last_message_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.last_message?.text || t('chats.noMessages')}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {item.channel && <span className="text-[10px] text-muted-foreground">{item.channel}</span>}
                    {item.unread_for_agent > 0 && (
                      <Badge className="h-5 min-w-[18px] rounded-full border-0 bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">
                        {item.unread_for_agent}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        className={cn(
          'flex min-h-[420px] flex-col rounded-xl border border-border bg-card',
          selectedId === null && 'hidden md:flex',
        )}
        aria-label={t('widget.inbox.title')}
      >
        {selectedId === null ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center" role="status">
            <MessageCircle className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-bold">{t('widget.inbox.selectPrompt')}</p>
          </div>
        ) : detailError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-medium">{t('widget.inbox.loadError')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void detailQuery.refetch()}>
              {t('widget.inbox.retry')}
            </Button>
          </div>
        ) : !conversation ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <header className="flex items-start gap-3 border-b border-border p-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t('widget.inbox.back')}
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-bold">{conversation.visitor_name}</h3>
                  {conversation.status === 'closed' && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('widget.inbox.closedBadge')}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[conversation.channel, conversation.visitor_email].filter(Boolean).join(' · ')}
                </p>
              </div>
              {conversation.status === 'open' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeConversation}
                  disabled={statusMutation.isPending}
                  aria-label={t('widget.inbox.close')}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  {t('widget.inbox.close')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reopenConversation}
                  disabled={statusMutation.isPending}
                  aria-label={t('widget.inbox.reopen')}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {t('widget.inbox.reopen')}
                </Button>
              )}
            </header>

            <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
              {conversation.messages.map((message) => {
                const isAgent = message.sender_type === 'agent'
                return (
                  <div key={message.id} className={cn('flex', isAgent ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%]', isAgent && 'text-right')}>
                      <p className="mb-1 px-1 text-[10px] font-medium text-muted-foreground">
                        {isAgent ? message.sender_name : t('widget.inbox.visitor')}
                      </p>
                      <div
                        className={cn(
                          'inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed',
                          isAgent
                            ? 'rounded-br-sm bg-primary text-primary-foreground'
                            : 'rounded-bl-sm bg-background text-foreground shadow-sm',
                        )}
                      >
                        {message.text}
                      </div>
                      {message.content_type === 'rich_json' && (
                        <RichMessage payload={message.rich_payload} className="text-left" />
                      )}
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <footer className="border-t border-border p-3">
              {actionError && (
                <p className="mb-2 px-1 text-xs text-destructive" role="alert">
                  {t(actionError)}
                </p>
              )}
              {conversation.status === 'open' ? (
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={reply}
                    maxLength={MAX_TEXT}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('widget.inbox.replyPlaceholder')}
                    aria-label={t('widget.inbox.replyPlaceholder')}
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                  <Button
                    size="icon"
                    onClick={sendReply}
                    disabled={!reply.trim() || replyMutation.isPending}
                    aria-label={t('widget.inbox.send')}
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  {t('widget.inbox.closedHint')}
                </p>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
