import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, BarChart3, CheckCheck, X, Clock, Trash2 } from 'lucide-react'
import type { Poll } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { SkeletonCardGrid } from '@/components/skeletons'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function PollsPage() {
  const { t } = useTranslation()
  const { canManage, user } = useAuth()
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({
    title: '', description: '', options: ['', ''], multipleChoice: false,
    showResults: 'after_vote', endsAt: '',
  })

  const fetchPolls = () => {
    setLoading(true)
    const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    api.get(`/polls${params}`)
      .then((data) => { setPolls(data.data ?? data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchPolls() }, [statusFilter])

  const createPoll = async () => {
    if (!form.title.trim() || form.options.filter((o) => o.trim()).length < 2) return
    try {
      const poll = await api.post('/polls', {
        title: form.title,
        description: form.description,
        options: form.options.filter((o) => o.trim()),
        multipleChoice: form.multipleChoice,
        showResults: form.showResults,
        endsAt: form.endsAt || undefined,
      })
      setPolls((prev) => [poll, ...prev])
    } catch { /* toast handled by api client */ }
    setShowNew(false)
    setForm({ title: '', description: '', options: ['', ''], multipleChoice: false, showResults: 'after_vote', endsAt: '' })
  }

  const vote = async (pollId: number, optionId: number) => {
    try {
      const updated = await api.post(`/polls/${pollId}/vote`, { optionId })
      setPolls((prev) => prev.map((p) => (p.id === pollId ? updated : p)))
    } catch { /* toast handled by api client */ }
  }

  const deletePoll = async (pollId: number) => {
    try {
      await api.delete(`/polls/${pollId}`)
      setPolls((prev) => prev.filter((p) => p.id !== pollId))
    } catch { /* toast handled by api client */ }
  }

  const calcPct = (votes: number, total: number) => (total > 0 ? Math.round((votes / total) * 100) : 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('polls.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">Голосование и сбор мнений</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="active">Активные</SelectItem>
              <SelectItem value="closed">Завершённые</SelectItem>
            </SelectContent>
          </Select>
          {canManage && (
            <Button onClick={() => setShowNew(!showNew)}>
              <Plus className="w-4 h-4 mr-1.5" />
              {t('polls.create')}
            </Button>
          )}
        </div>
      </div>

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('polls.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="poll-title" className="text-sm font-bold">{t('polls.question')}</label>
              <Input id="poll-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('polls.question')} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="poll-description" className="text-sm font-bold">{t('polls.description')}</label>
              <Textarea id="poll-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            {form.options.map((opt, i) => (
              <div key={i} className="space-y-1.5">
                <label htmlFor={`poll-option-${i}`} className="text-sm font-bold">{t('polls.optionLabel', { number: i + 1 })}</label>
                <div className="flex gap-2">
                  <Input id={`poll-option-${i}`} value={opt} onChange={(e) => { const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o }) }} className="flex-1" />
                  {form.options.length > 2 && (
                    <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })} aria-label={t('common.delete')}><X className="w-4 h-4" /></Button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ''] })}><Plus className="w-3.5 h-3.5 mr-1" /> Вариант</Button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="poll-ends" className="text-sm font-bold">Дата завершения</label>
                <Input id="poll-ends" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="poll-results" className="text-sm font-bold">Показ результатов</label>
                <Select value={form.showResults} onValueChange={(v) => setForm({ ...form, showResults: v })}>
                  <SelectTrigger id="poll-results" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_vote">После голосования</SelectItem>
                    <SelectItem value="always">Всегда видны</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label htmlFor="poll-multiple" className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox id="poll-multiple" checked={form.multipleChoice} onCheckedChange={(v) => setForm({ ...form, multipleChoice: !!v })} />
              {t('polls.multipleChoice')}
            </label>
            <div className="flex gap-2">
              <Button onClick={createPoll} disabled={!form.title.trim() || form.options.filter((o) => o.trim()).length < 2}>{t('polls.submitBtn')}</Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <SkeletonCardGrid count={6} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {polls.map((poll) => {
            const hasVoted = (poll.myVotes?.length || 0) > 0
            const showResultsNow = poll.showResults === 'always' || hasVoted || poll.isClosed
            return (
              <Card key={poll.id} className="flex flex-col">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <BarChart3 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm leading-tight truncate">{poll.title}</h3>
                          {poll.isClosed && <Badge variant="secondary" className="text-[9px] shrink-0">Закрыт</Badge>}
                        </div>
                        {poll.description && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{poll.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {poll.options.map((opt) => {
                        const pct = showResultsNow ? calcPct(opt.votesCount, poll.totalVotes || 1) : 0
                        const isSelected = poll.myVotes?.includes(opt.id)
                        return (
                          <div
                            key={opt.id}
                            onClick={() => { if (!poll.isClosed) vote(poll.id, opt.id) }}
                            className={`relative overflow-hidden rounded-lg p-2.5 transition-all ${
                              poll.isClosed
                                ? 'bg-muted/30 opacity-70'
                                : hasVoted
                                  ? (isSelected ? 'ring-2 ring-primary bg-primary/5' : 'bg-muted/30')
                                  : 'cursor-pointer hover:bg-primary/10 bg-muted/50'
                            }`}
                          >
                            {showResultsNow && (
                              <div className="absolute inset-y-0 left-0 bg-primary/5 transition-all rounded-lg" style={{ width: `${pct}%` }} />
                            )}
                            <div className="relative z-10 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {showResultsNow && isSelected && <CheckCheck className="w-3 h-3 text-primary shrink-0" />}
                                <span className={`text-sm truncate ${isSelected ? 'font-bold' : ''}`}>{opt.text}</span>
                              </div>
                              {showResultsNow && (
                                <span className="text-xs font-bold text-muted-foreground shrink-0">{pct}%</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{poll.options.length} вар. · {poll.totalVotes} голосов</span>
                      {poll.endsAt && !poll.isClosed && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {format(new Date(poll.endsAt), 'd MMM HH:mm', { locale: ru })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {hasVoted ? (
                        <Badge variant="secondary" className="text-[9px] gap-0.5"><CheckCheck className="w-2.5 h-2.5" /> Голос учтён</Badge>
                      ) : !poll.isClosed ? (
                        <span className="text-primary font-medium">Выбрать</span>
                      ) : null}
                      {(canManage || user?.id === poll.createdBy) && (
                        <Button variant="ghost" size="icon" className="w-6 h-6 text-destructive/60 hover:text-destructive" onClick={() => deletePoll(poll.id)} aria-label="Удалить">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {!loading && polls.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">{t('polls.noPolls')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
