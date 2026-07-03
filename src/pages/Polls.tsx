import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, BarChart3, CheckCheck, Loader2, X } from "lucide-react"
import type { Poll } from "@/types"
import { useAuth } from "@/context/AuthContext"

const API = "http://localhost:4000/api"

export default function PollsPage() {
  const { canManage, token } = useAuth()
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", options: ["", ""], multipleChoice: false })

  useEffect(() => {
    fetch(`${API}/polls`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setPolls(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const createPoll = async () => {
    if (!form.title.trim() || form.options.filter(o => o.trim()).length < 2) return
    try {
      const res = await fetch(`${API}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          options: form.options.filter(o => o.trim()),
          multipleChoice: form.multipleChoice,
        }),
      })
      if (res.ok) {
        const poll = await res.json()
        setPolls(prev => [poll, ...prev])
      }
    } catch { /* ignore */ }
    setShowNew(false)
    setForm({ title: "", description: "", options: ["", ""], multipleChoice: false })
  }

  const vote = async (pollId: number, optionId: number) => {
    try {
      const res = await fetch(`${API}/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optionId }),
      })
      if (res.ok) {
        const updated = await res.json()
        setPolls(prev => prev.map(p => p.id === pollId ? updated : p))
      }
    } catch { /* ignore */ }
  }

  const calcPct = (votes: number, total: number) => total > 0 ? Math.round(votes / total * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Опросы</h1>
          <p className="text-sm text-muted-foreground mt-1">Голосование и сбор мнений</p>
        </div>
        {canManage && (
        <Button onClick={() => setShowNew(!showNew)}>
          <Plus className="w-4 h-4 mr-1.5" /> Создать опрос
        </Button>
        )}
      </div>

      {showNew && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Новый опрос</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold">Вопрос</label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Задайте вопрос" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold">Описание</label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            {form.options.map((opt, i) => (
              <div key={i} className="space-y-1.5">
                <label className="text-sm font-bold">Вариант {i + 1}</label>
                <div className="flex gap-2">
                  <Input value={opt} onChange={e => {
                    const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o })
                  }} className="flex-1" />
                  {form.options.length > 2 && (
                    <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Вариант
            </Button>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.multipleChoice} onCheckedChange={v => setForm({ ...form, multipleChoice: !!v })} />
              Можно выбрать несколько вариантов
            </label>
            <div className="flex gap-2">
              <Button onClick={createPoll} disabled={!form.title.trim() || form.options.filter(o => o.trim()).length < 2}>Создать</Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {polls.map(poll => {
          const hasVoted = (poll.myVotes?.length || 0) > 0
          return (
            <Card key={poll.id} className="flex flex-col">
              <CardContent className="p-5 flex-1 flex flex-col">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <BarChart3 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm leading-tight truncate">{poll.title}</h3>
                      {poll.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{poll.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {poll.options.map(opt => {
                      const pct = calcPct(opt.votesCount, poll.totalVotes || 1)
                      const isSelected = poll.myVotes?.includes(opt.id)
                      return (
                        <div
                          key={opt.id}
                          onClick={() => vote(poll.id, opt.id)}
                          className={`relative overflow-hidden rounded-lg p-2.5 transition-all ${hasVoted ? (isSelected ? "ring-2 ring-primary bg-primary/5" : "bg-muted/30") : "cursor-pointer hover:bg-primary/10 bg-muted/50"}`}
                        >
                          {hasVoted && (
                            <div className="absolute inset-0 bg-primary/5 transition-all" style={{ width: `${pct}%` }} />
                          )}
                          <div className="relative z-10 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {hasVoted && isSelected && <CheckCheck className="w-3 h-3 text-primary shrink-0" />}
                              <span className={`text-sm truncate ${isSelected ? "font-bold" : ""}`}>{opt.text}</span>
                            </div>
                            {hasVoted && (
                              <span className="text-xs font-bold text-muted-foreground shrink-0">{pct}%</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t text-[10px] text-muted-foreground">
                  <span>{poll.options.length} вар. · {poll.totalVotes} гол.</span>
                  {hasVoted ? (
                    <Badge variant="secondary" className="text-[9px] gap-0.5">
                      <CheckCheck className="w-2.5 h-2.5" /> Проголосовал
                    </Badge>
                  ) : (
                    <span className="text-primary font-medium">Нажмите, чтобы выбрать</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {!loading && polls.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">Опросов пока нет</p>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
