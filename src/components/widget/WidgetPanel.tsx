import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MessageCircle, Send, X } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import {
  createWidgetConversation,
  fetchWidgetConfig,
  fetchWidgetThread,
  sendWidgetMessage,
  WidgetApiError,
  type WidgetChannelConfig,
  type WidgetMessage,
} from '@/lib/widget-api'

// Визуальные метрики (радиусы бабблов, тени, акцент #1f93ff) — из Chatwoot (MIT Expat),
// app/javascript/sdk/sdk.css и widget/assets/scss/views/_conversation.scss.

const POLL_INTERVAL_MS = 5000
const VISITOR_KEY = 'sd_widget_visitor'
const MAX_TEXT = 4000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function conversationKey(websiteToken: string): string {
  return `sd_widget_conversation_${websiteToken}`
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    return
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    return
  }
}

function getVisitorId(): string {
  const existing = safeGet(VISITOR_KEY)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  safeSet(VISITOR_KEY, id)
  return id
}

export interface WidgetPanelProps {
  websiteToken: string
  onClose?: () => void
  className?: string
}

export default function WidgetPanel({ websiteToken, onClose, className }: WidgetPanelProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<WidgetChannelConfig | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading')
  const [conversationToken, setConversationToken] = useState<string | null>(() =>
    safeGet(conversationKey(websiteToken)),
  )
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [text, setText] = useState('')
  const [formError, setFormError] = useState('')
  const [sendError, setSendError] = useState('')
  const [starting, setStarting] = useState(false)
  const [sending, setSending] = useState(false)
  const [threadLoading, setThreadLoading] = useState(() =>
    Boolean(safeGet(conversationKey(websiteToken))),
  )
  const listRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef(0)

  useEffect(() => {
    let active = true
    fetchWidgetConfig(websiteToken)
      .then((data) => {
        if (!active) return
        setConfig(data)
        setLoadState('ready')
      })
      .catch((error) => {
        if (!active) return
        setLoadState(error instanceof WidgetApiError && error.status === 404 ? 'not_found' : 'error')
      })
    return () => {
      active = false
    }
  }, [websiteToken])

  useEffect(() => {
    if (!conversationToken || loadState !== 'ready') return
    let active = true
    fetchWidgetThread(websiteToken, conversationToken)
      .then((data) => {
        if (!active) return
        setStatus(data.status)
        setMessages(data.messages)
        lastIdRef.current = data.messages.length > 0 ? data.messages[data.messages.length - 1].id : 0
        setThreadLoading(false)
      })
      .catch((error) => {
        if (!active) return
        setThreadLoading(false)
        if (error instanceof WidgetApiError && error.status === 404) {
          safeRemove(conversationKey(websiteToken))
          setConversationToken(null)
          setMessages([])
          return
        }
        setSendError('widget.loadError')
      })
    return () => {
      active = false
    }
  }, [conversationToken, loadState, websiteToken])

  useEffect(() => {
    if (!conversationToken || loadState !== 'ready') return
    const timer = window.setInterval(() => {
      fetchWidgetThread(websiteToken, conversationToken, lastIdRef.current)
        .then((data) => {
          setStatus(data.status)
          if (data.messages.length === 0) return
          lastIdRef.current = data.messages[data.messages.length - 1].id
          setMessages((previous) => {
            const seen = new Set(previous.map((message) => message.id))
            const next = [...previous]
            for (const message of data.messages) {
              if (!seen.has(message.id)) next.push(message)
            }
            return next
          })
        })
        .catch(() => {
          return
        })
    }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [conversationToken, loadState, websiteToken])

  useEffect(() => {
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, threadLoading, status])

  const start = useCallback(async () => {
    const visitorName = name.trim()
    if (!visitorName) {
      setFormError('widget.nameRequired')
      return
    }
    const visitorEmail = email.trim()
    if (visitorEmail && !EMAIL_RE.test(visitorEmail)) {
      setFormError('widget.invalidEmail')
      return
    }
    setStarting(true)
    setFormError('')
    try {
      const conversation = await createWidgetConversation(websiteToken, {
        visitor_id: getVisitorId(),
        name: visitorName,
        email: visitorEmail || undefined,
      })
      safeSet(conversationKey(websiteToken), conversation.token)
      lastIdRef.current = 0
      setMessages([])
      setStatus('open')
      setSendError('')
      setConversationToken(conversation.token)
    } catch {
      setFormError('widget.loadError')
    } finally {
      setStarting(false)
    }
  }, [email, name, websiteToken])

  const send = useCallback(async () => {
    const value = text.trim()
    if (!value || !conversationToken || sending) return
    setSending(true)
    setSendError('')
    try {
      const message = await sendWidgetMessage(websiteToken, conversationToken, value)
      setMessages((previous) =>
        previous.some((item) => item.id === message.id) ? previous : [...previous, message],
      )
      lastIdRef.current = Math.max(lastIdRef.current, message.id)
      setText('')
    } catch (error) {
      if (error instanceof WidgetApiError && error.status === 409) {
        setStatus('closed')
        setSendError('widget.closed')
      } else {
        setSendError('widget.sendError')
      }
    } finally {
      setSending(false)
    }
  }, [conversationToken, sending, text, websiteToken])

  const resetConversation = useCallback(() => {
    safeRemove(conversationKey(websiteToken))
    lastIdRef.current = 0
    setConversationToken(null)
    setMessages([])
    setStatus('open')
    setSendError('')
    setFormError('')
  }, [websiteToken])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  const accent = config?.color || '#1f93ff'

  if (loadState === 'loading') {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-white', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (loadState === 'not_found' || loadState === 'error' || !config) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-3 bg-white px-8 text-center', className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <MessageCircle className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-base font-semibold text-slate-900">
          {loadState === 'not_found' ? t('widget.notFound') : t('widget.loadError')}
        </p>
        <p className="text-sm text-slate-500">
          {loadState === 'not_found' ? t('widget.notFoundHint') : t('widget.loadErrorHint')}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('widget.close')}
          </button>
        )}
      </div>
    )
  }

  if (!conversationToken) {
    return (
      <div className={cn('flex h-full w-full flex-col bg-white', className)}>
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: accent }}
          >
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{config.name}</p>
            <p className="truncate text-xs text-slate-500">{t('widget.subtitle')}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('widget.close')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: accent }}
          >
            <MessageCircle className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-center text-lg font-semibold text-slate-900">{config.name}</h2>
          {config.welcome && (
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">{config.welcome}</p>
          )}

          <div className="mt-6 space-y-3">
            <div>
              <label htmlFor="sd-widget-name" className="mb-1 block text-xs font-medium text-slate-600">
                {t('widget.name')}
              </label>
              <input
                id="sd-widget-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('widget.namePlaceholder')}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </div>
            <div>
              <label htmlFor="sd-widget-email" className="mb-1 block text-xs font-medium text-slate-600">
                {t('widget.email')}
              </label>
              <input
                id="sd-widget-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('widget.emailPlaceholder')}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </div>
            {formError && <p className="text-xs text-red-600">{t(formError)}</p>}
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: accent }}
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {starting ? t('widget.starting') : t('widget.start')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex h-full w-full flex-col bg-[#f7f8fa]', className)}>
      <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: accent }}
        >
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{config.name}</p>
          <p className="truncate text-xs text-slate-500">
            {status === 'closed' ? t('widget.closed') : t('widget.subtitle')}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('widget.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {config.welcome && (
          <div className="mb-3 max-w-[88%]">
            <p className="mb-1 pl-1 text-xs font-medium text-slate-500">{config.name}</p>
            <div className="inline-block rounded-[20px] rounded-bl-[6px] bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-[0_4px_6px_rgba(50,50,93,0.08),0_1px_3px_rgba(0,0,0,0.05)]">
              {config.welcome}
            </div>
          </div>
        )}

        {threadLoading && messages.length === 0 && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}

        {messages.map((message, index) => {
          const previous = index > 0 ? messages[index - 1] : null
          const showName = message.sender_type === 'agent' && (!previous || previous.sender_type !== 'agent')
          const isVisitor = message.sender_type === 'visitor'
          return (
            <div
              key={message.id}
              className={cn('flex', isVisitor ? 'justify-end' : 'justify-start', showName && 'mt-3')}
            >
              <div className={cn('max-w-[85%]', isVisitor && 'text-right')}>
                {showName && (
                  <p className="mb-1 pl-1 text-xs font-medium text-slate-500">{message.sender_name}</p>
                )}
                <div
                  className={cn(
                    'inline-block whitespace-pre-wrap break-words px-4 py-3 text-left text-sm leading-relaxed',
                    isVisitor
                      ? 'rounded-[20px] rounded-br-[6px] text-white'
                      : 'rounded-[20px] rounded-bl-[6px] bg-white text-slate-900 shadow-[0_4px_6px_rgba(50,50,93,0.08),0_1px_3px_rgba(0,0,0,0.05)]',
                  )}
                  style={isVisitor ? { backgroundColor: accent } : undefined}
                >
                  {message.text}
                </div>
                <span className="mt-1 block text-[10px] text-slate-400">
                  {formatTime(message.created_at)}
                </span>
              </div>
            </div>
          )
        })}

        {status === 'closed' && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-sm font-medium text-slate-900">{t('widget.closed')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('widget.closedHint')}</p>
            <button
              type="button"
              onClick={resetConversation}
              className="mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: accent }}
            >
              {t('widget.newConversation')}
            </button>
          </div>
        )}
      </div>

      {status === 'open' && (
        <footer className="border-t border-slate-100 bg-white p-3">
          {sendError && <p className="mb-2 px-1 text-xs text-red-600">{t(sendError)}</p>}
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={text}
              maxLength={MAX_TEXT}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('widget.messagePlaceholder')}
              aria-label={t('widget.messagePlaceholder')}
              className="max-h-24 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!text.trim() || sending}
              aria-label={t('widget.send')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: accent }}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}
