import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { useSocket } from '@/context/SocketContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useTickets } from '@/context/ticket-context'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatTime } from '@/lib/utils'
import {
  ArrowLeft,
  Send,
  User,
  MessageSquare,
  Tag,
  Lock,
  ExternalLink,
  Monitor,
  Paperclip,
  ImageIcon,
  FileText,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import type { TicketStatus, TicketPriority } from '@/types'
import { API_URL } from '@/lib/api'

function parseMentions(value: unknown): number[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n))
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : []
    } catch {
      return []
    }
  }
  return []
}

function mapTicketDetail(raw: Record<string, unknown>): Ticket {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    status: raw.status,
    priority: raw.priority,
    category: raw.category,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    computerName: raw.computer_name,
    userAccount: raw.user_account,
    createdBy: { id: raw.created_by, name: raw.created_by_name || 'User', email: '', avatar: '' },
    assignedTo: raw.assigned_to
      ? {
          id: raw.assigned_to,
          name: raw.assigned_name || '',
          email: raw.assigned_email || '',
          avatar: raw.assigned_avatar || '',
        }
      : undefined,
    messages: Array.isArray(raw.messages)
      ? (raw.messages as Record<string, unknown>[]).map((m: Record<string, unknown>) => ({
          id: m.id,
          ticketId: m.ticket_id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar || '',
          text: m.text,
          attachments: m.attachments
            ? typeof m.attachments === 'string'
              ? JSON.parse(m.attachments)
              : m.attachments
            : [],
          mentions: parseMentions(m.mentions),
          createdAt: m.created_at,
          isInternal: !!m.is_internal,
        }))
      : [],
    messages_count: raw.messages_count || (Array.isArray(raw.messages) ? raw.messages.length : 0),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export default function TicketDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { tickets, employees, updateTicketStatus, updateTicketPriority, assignTicket, addMessage, updateTicketTags } = useTickets()
  const { canManage, token } = useAuth()
  const { socket } = useSocket()
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const ctxTicket = tickets.find((t) => t.id === Number(id))
  const ticket = detailTicket || ctxTicket

  useEffect(() => {
    if (!id || !token) return
    setDetailLoading(true)
    fetch(`${API_URL}/tickets/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setDetailTicket(mapTicketDetail(json.data))
        }
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [id, token])

  const [messageText, setMessageText] = useState('')
  const mentionAtIdxRef = useRef<number>(-1)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [showMentions, setShowMentions] = useState(false)
  const [tagsDraft, setTagsDraft] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: ticket?.messages.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  useEffect(() => {
    if (virtualizer.getTotalSize() > 0) {
      virtualizer.scrollToIndex((ticket?.messages.length ?? 1) - 1, { align: 'end' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.messages.length])

  useEffect(() => {
    if (!socket || !ticket) return
    socket.emit('join:ticket', ticket.id)
    const onMessage = (data: { ticketId: number; message: { senderName: string } }) => {
      if (data.ticketId === ticket.id) {
        toast.info(t('tickets.newMessageFrom', { name: data.message.senderName }))
      }
    }
    socket.on('ticket:message', onMessage)
    return () => {
      socket.off('ticket:message', onMessage)
      socket.emit('leave:ticket', ticket.id)
    }
  }, [socket, ticket, t])

  if (detailLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="text-center py-20" role="alert">
        <h2 className="font-bold text-lg">{t('tickets.notFound')}</h2>
        <Button variant="link" onClick={() => navigate('/tickets')}>
          {t('common.back')}
        </Button>
      </div>
    )
  }

  const handleSend = () => {
    if (!messageText.trim() && attachments.length === 0) return
    addMessage(ticket.id, messageText, isInternal, attachments.length > 0 ? attachments : undefined)
    setMessageText('')
    setIsInternal(false)
    setAttachments([])
    setShowMentions(false)
    mentionAtIdxRef.current = -1
    setMentionQuery('')
  }

  const handleSaveTags = () => {
    const parsed = tagsDraft.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20)
    const merged = Array.from(new Set([...(ticket.tags || []), ...parsed]))
    updateTicketTags(ticket.id, merged)
    if (detailTicket) setDetailTicket({ ...detailTicket, tags: merged })
    setTagsDraft('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${API_URL}/tickets/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (res.ok) {
        const data = await res.json()
        setAttachments((prev) => [...prev, { url: data.url, name: data.name }])
      }
    } catch {
      /* ignore */
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const updateMentionState = (value: string, cursorPos: number) => {
    setShowMentions(false)
    mentionAtIdxRef.current = -1
    setMentionQuery('')
    const before = value.slice(0, cursorPos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return
    const rest = before.slice(atIdx + 1)
    if (rest.includes(' ') || rest.includes('\n') || rest.length > 40) return
    mentionAtIdxRef.current = atIdx
    setMentionQuery(rest)
    const matches = employees.filter((e) => e.name.toLowerCase().startsWith(rest.toLowerCase()))
    setShowMentions(matches.length > 0)
    setMentionIndex(0)
  }

  const filteredMentions = mentionQuery
    ? employees.filter((e) => e.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

  const acceptMention = (employeeName: string) => {
    const atIdx = mentionAtIdxRef.current
    if (atIdx < 0) return
    setMessageText((prev) => prev.slice(0, atIdx + 1) + employeeName + prev.slice(atIdx + 1 + mentionQuery.length))
    setShowMentions(false)
    mentionAtIdxRef.current = -1
    setMentionQuery('')
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const pos = atIdx + 1 + employeeName.length
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  const handleMessageTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setMessageText(value)
    updateMentionState(value, e.target.selectionStart ?? value.length)
  }

  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex((prev) => (prev + 1) % Math.max(filteredMentions.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex((prev) => (prev - 1 + Math.max(filteredMentions.length, 1)) % Math.max(filteredMentions.length, 1))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const emp = filteredMentions[mentionIndex]
      if (emp) acceptMention(emp.name)
    } else if (e.key === 'Escape') {
      setShowMentions(false)
      mentionAtIdxRef.current = -1
      setMentionQuery('')
    }
  }

  const renderMentionedText = (rawText: string) => {
    if (!rawText.includes('@')) return rawText
    const parts = rawText.split(/(@[^\s@]+(?:\s+[^\s@]+)?)/)
    return parts.map((part, idx) => {
      if (!part.startsWith('@') || part.length < 2) return part
      const emp = employees.find((e) => {
        const pat = part.slice(1).toLowerCase()
        return e.name.toLowerCase() === pat || e.email.split('@')[0].toLowerCase() === pat
      })
      if (!emp) return part
      return (
        <span key={idx} className="text-primary font-medium" data-testid="message-mention">
          {part}
        </span>
      )
    })
  }

  const statusLabel: Record<string, string> = {
    open: t('tickets.open'),
    in_progress: t('tickets.inProgress'),
    resolved: t('tickets.resolved'),
    closed: t('tickets.closed'),
  }

  const priorityLabel: Record<string, string> = {
    low: t('tickets.low'),
    medium: t('tickets.medium'),
    high: t('tickets.high'),
    critical: t('tickets.critical'),
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')} className="gap-1.5">
        <ArrowLeft className="w-4 h-4" />
        {t('tickets.backToTickets')}
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">{ticket.title}</CardTitle>
                    <Badge className={`text-[10px] ${ticket.status.replace('_', '-')}`}>
                      {statusLabel[ticket.status]}
                    </Badge>
                    <Badge className={`text-[10px] priority-${ticket.priority}`}>
                      {priorityLabel[ticket.priority]}
                    </Badge>
                    {(ticket.escalationLevel || 0) > 0 && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t('tickets.escalated', { level: ticket.escalationLevel })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('tickets.createdAt', { date: formatDate(ticket.createdAt) })}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground/80 mb-4">{ticket.description}</p>
              {ticket.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  {ticket.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[9px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                {t('tickets.messages')} ({ticket.messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={scrollRef} className="max-h-[400px] overflow-y-auto mb-4 pr-2">
                <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                  {virtualizer.getVirtualItems().length > 0
                    ? virtualizer.getVirtualItems().map((virtualItem) => {
                        const msg = ticket.messages[virtualItem.index]
                        return (
                          <div
                            key={msg.id}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualItem.start}px)`,
                            }}
                            className={`flex gap-3 ${msg.isInternal ? 'opacity-70' : ''}`}
                          >
                            <Avatar className="w-8 h-8 mt-0.5">
                              <AvatarFallback className="text-[10px]">{msg.senderName[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold">{msg.senderName}</span>
                                <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                                {msg.isInternal && (
                                  <Badge variant="secondary" className="text-[8px] gap-0.5">
                                    <Lock className="w-2.5 h-2.5" /> {t('tickets.internalBadge')}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-foreground/80">{renderMentionedText(msg.text)}</p>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {msg.attachments.map((att: Record<string, unknown>, i: number) => (
                                    <a
                                      key={i}
                                      href={att.url as string}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2 py-1 hover:bg-muted/80 transition-colors"
                                    >
                                      {(att.url as string).match(/\.(png|jpg|jpeg|gif|svg)$/i) ? (
                                        <ImageIcon className="w-3 h-3" />
                                      ) : (
                                        <FileText className="w-3 h-3" />
                                      )}
                                      {(att.name as string) || (att.url as string).split('/').pop()}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                    : ticket.messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 mb-4 ${msg.isInternal ? 'opacity-70' : ''}`}>
                          <Avatar className="w-8 h-8 mt-0.5">
                            <AvatarFallback className="text-[10px]">{msg.senderName[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold">{msg.senderName}</span>
                              <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                              {msg.isInternal && (
                                <Badge variant="secondary" className="text-[8px] gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> {t('tickets.internalBadge')}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-foreground/80">{renderMentionedText(msg.text)}</p>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {msg.attachments.map((att: Record<string, unknown>, i: number) => (
                                  <a
                                    key={i}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2 py-1 hover:bg-muted/80 transition-colors"
                                  >
                                    {att.url.match(/\.(png|jpg|jpeg|gif|svg)$/i) ? (
                                      <ImageIcon className="w-3 h-3" />
                                    ) : (
                                      <FileText className="w-3 h-3" />
                                    )}
                                    {att.name || att.url.split('/').pop()}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                </div>
                <div ref={messagesEndRef} />
              </div>

              <Separator className="my-3" />
              <div className="space-y-2 relative">
                <Textarea
                  ref={textareaRef}
                  value={messageText}
                  onChange={handleMessageTextChange}
                  onKeyDown={handleMessageKeyDown}
                  placeholder={t('tickets.messagePlaceholder')}
                  className="min-h-[80px]"
                  id="ticket-message"
                />
                {showMentions && filteredMentions.length > 0 && (
                  <div className="absolute z-50 w-64 max-h-48 overflow-y-auto rounded-md border bg-background shadow-md" data-testid="mention-menu">
                    {filteredMentions.map((emp, idx) => (
                      <button
                        key={emp.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          acceptMention(emp.name)
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted ${idx === mentionIndex ? 'bg-muted' : ''}`}
                      >
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="text-[8px]">{emp.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{emp.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2 py-1">
                        {att.url.match(/\.(png|jpg|jpeg|gif|svg)$/i) ? (
                          <ImageIcon className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        {att.name}
                        <button
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-foreground ml-1"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="ticket-internal"
                      className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                    >
                      <input
                        id="ticket-internal"
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded"
                      />
                      <Lock className="w-3 h-3" />
                      {t('tickets.internalNote')}
                    </label>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button size="sm" onClick={handleSend} disabled={!messageText.trim() && attachments.length === 0}>
                    <Send className="w-4 h-4 mr-1.5" />
                    {t('tickets.sendBtn')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('tickets.management')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="ticket-status" className="text-xs font-bold text-muted-foreground">
                    {t('tickets.status')}
                  </label>
                  <Select value={ticket.status} onValueChange={(v) => updateTicketStatus(ticket.id, v as TicketStatus)}>
                    <SelectTrigger id="ticket-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">{t('tickets.open')}</SelectItem>
                      <SelectItem value="in_progress">{t('tickets.inProgress')}</SelectItem>
                      <SelectItem value="resolved">{t('tickets.resolved')}</SelectItem>
                      <SelectItem value="closed">{t('tickets.closed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="ticket-priority" className="text-xs font-bold text-muted-foreground">
                    {t('tickets.priority')}
                  </label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => updateTicketPriority(ticket.id, v as TicketPriority)}
                  >
                    <SelectTrigger id="ticket-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('tickets.low')}</SelectItem>
                      <SelectItem value="medium">{t('tickets.medium')}</SelectItem>
                      <SelectItem value="high">{t('tickets.high')}</SelectItem>
                      <SelectItem value="critical">{t('tickets.critical')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="ticket-assign" className="text-xs font-bold text-muted-foreground">
                    {t('tickets.assignedTo')}
                  </label>
                  <Select
                    value={ticket.assignedTo ? String(ticket.assignedTo.id) : ''}
                    onValueChange={(v) => assignTicket(ticket.id, Number(v))}
                  >
                    <SelectTrigger id="ticket-assign">
                      <SelectValue placeholder={t('tickets.selectEmployee')} />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="ticket-tags" className="text-xs font-bold text-muted-foreground">
                    {t('tickets.tags')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="ticket-tags"
                      value={tagsDraft}
                      onChange={(e) => setTagsDraft(e.target.value)}
                      placeholder={t('tickets.tagsInputPlaceholder')}
                    />
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleSaveTags()}
                      disabled={!tagsDraft.trim()}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      {t('tickets.saveTags')}
                    </Button>
                  </div>
                  {(ticket.tags || []).length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {ticket.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[9px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('tickets.details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('tickets.createdBy')}</p>
                  <p className="text-sm font-bold">{ticket.createdBy.name}</p>
                </div>
              </div>
              {ticket.assignedTo && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('tickets.assignedNotify')}</p>
                    <p className="text-sm font-bold">{ticket.assignedTo.name}</p>
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">{t('tickets.updatedAt')}</p>
                <p className="text-sm">{formatDate(ticket.updatedAt)}</p>
              </div>
              {(ticket.computerName || ticket.userAccount) && (
                <div className="pt-3 border-t space-y-2">
                  <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> {t('tickets.systemInfo')}
                  </p>
                  {ticket.computerName && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{t('tickets.computerName')}:</p>
                      <p className="text-sm font-medium">{ticket.computerName}</p>
                    </div>
                  )}
                  {ticket.userAccount && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{t('tickets.userAccount')}:</p>
                      <p className="text-sm font-mono text-xs">{ticket.userAccount}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
