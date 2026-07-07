import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Search, Newspaper, Plus, Clock, User, AlertTriangle, Pin, Loader2 } from "lucide-react"
import type { NewsPost } from "@/types"
import { useAuth } from "@/context/AuthContext"

const API = "http://localhost:4000/api"

function mapNews(raw: any): NewsPost {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    important: !!raw.important,
    authorId: raw.author_id,
    authorName: raw.author_name,
    createdAt: raw.created_at,
  }
}

const PER_PAGE = 6

export default function NewsPage() {
  const { t } = useTranslation()
  const { canManage, token } = useAuth()
  const [news, setNews] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showImportant, setShowImportant] = useState(false)
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newImportant, setNewImportant] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PER_PAGE) })
    if (showImportant) params.set('important', 'true')
    if (search.trim()) params.set('q', search.trim())
    fetch(`${API}/news?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : { data: [], total: 0, totalPages: 1 })
      .then(({ data, total, totalPages: tp }) => { setNews(data.map(mapNews)); setTotalPages(tp || Math.ceil((total || 0) / PER_PAGE)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token, page, search, showImportant])

  const paged = news
  const resetPage = () => setPage(1)

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    try {
      const res = await fetch(`${API}/news`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle, content: newContent, important: newImportant }),
      })
      if (res.ok) {
        const post = mapNews(await res.json())
        setNews(prev => [post, ...prev])
      }
    } catch { /* ignore */ }
    setOpen(false)
    setNewTitle("")
    setNewContent("")
    setNewImportant(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-primary" />
            {t("news.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Объявления и обновления системы</p>
        </div>
        {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" />{t("news.create")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("news.createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="news-title" className="text-sm font-bold">{t("news.titleLabel")}</label>
                <Input id="news-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t("news.titleLabel")} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="news-content" className="text-sm font-bold">{t("news.contentLabel")}</label>
                <Textarea id="news-content" value={newContent} onChange={e => setNewContent(e.target.value)} placeholder={t("news.contentLabel")} rows={6} />
              </div>
              <label htmlFor="news-important" className="flex items-center gap-2 text-sm">
                <input id="news-important" type="checkbox" checked={newImportant} onChange={e => setNewImportant(e.target.checked)} className="rounded" />
                <span>{t("news.importantLabel")}</span>
              </label>
              <Button onClick={handleCreate} className="w-full">{t("news.submitBtn")}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); resetPage() }} placeholder={t("news.searchPlaceholder")} className="pl-9" />
        </div>
        <Button variant={showImportant ? "default" : "outline"} size="sm" onClick={() => { setShowImportant(!showImportant); resetPage() }} className="gap-2">
          <AlertTriangle className="w-4 h-4" />{t("news.important")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {news.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">{t("news.empty")}</p>
          </div>
        )}
        {paged.map(n => (
          <div key={n.id} className="rounded-xl border bg-card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              {n.important && <Pin className="w-4 h-4 text-destructive shrink-0" />}
              <h3 className="font-bold text-sm leading-snug">{n.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 flex-1 mb-4">{n.content}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-3 border-t">
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{n.authorName}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(n.createdAt).toLocaleDateString()}</span>
              {n.important && <Badge className="text-[9px] bg-destructive/10 text-destructive border-0 ml-auto">Важно</Badge>}
            </div>
          </div>
        ))}
      </div>
      )}

      {totalPages > 1 && page < totalPages && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setPage(p => p + 1)}>
            {t("news.showMore")}
          </Button>
        </div>
      )}
    </div>
  )
}
