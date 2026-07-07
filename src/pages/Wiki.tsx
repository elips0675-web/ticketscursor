import { useState, useEffect, useMemo, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, BookOpen, Plus, Clock, User, Tag, Layers, Loader2, ImageIcon } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import type { WikiArticle } from "@/types"
import { useAuth } from "@/context/AuthContext"
import { useTranslation } from "react-i18next"

const API = "http://localhost:4000/api"

function mapArticle(raw: any): WikiArticle {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    category: raw.category,
    tags: typeof raw.tags === "string" ? JSON.parse(raw.tags) : (raw.tags || []),
    authorId: raw.author_id,
    authorName: raw.author_name,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

const CATEGORIES = ["Все", "Руководство", "Правила", "Инструкции", "FAQ", "Интеграции"]

export default function WikiPage() {
  const { canManage, token } = useAuth()
  const { t } = useTranslation()
  const [articles, setArticles] = useState<WikiArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Все")
  const [article, setArticle] = useState<WikiArticle | null>(null)
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newCategory, setNewCategory] = useState("Руководство")
  const [newTags, setNewTags] = useState("")
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    const form = new FormData()
    form.append("image", file)
    try {
      const res = await fetch(`${API}/wiki/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (res.ok) {
        const { url } = await res.json()
        setNewContent(prev => prev + `\n\n![${file.name}](${url})\n`)
      }
    } catch { /* ignore */ }
    setUploadingImg(false)
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  useEffect(() => {
    fetch(`${API}/wiki`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setArticles(data.map(mapArticle)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const filtered = useMemo(() => {
    let items = articles
    if (category !== "Все") items = items.filter(a => a.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.tags.some(t => t.includes(q)))
    }
    return items
  }, [articles, search, category])

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    try {
      const res = await fetch(`${API}/wiki`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          category: newCategory,
          tags: newTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      })
      if (res.ok) {
        const created = mapArticle(await res.json())
        setArticles(prev => [created, ...prev])
        setArticle(created)
      }
    } catch { /* ignore */ }
    setOpen(false)
    setNewTitle("")
    setNewContent("")
    setNewCategory("Руководство")
    setNewTags("")
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            {t("wiki.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("wiki.description")}</p>
        </div>
        {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" />{t("wiki.create")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("wiki.createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <label htmlFor="wiki-title" className="text-sm font-medium">{t("wiki.articleTitle")}</label>
              <Input id="wiki-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t("wiki.articleTitle")} />
              <label htmlFor="wiki-content" className="text-sm font-medium">{t("wiki.content")}</label>
              <Textarea id="wiki-content" value={newContent} onChange={e => setNewContent(e.target.value)} placeholder={t("wiki.contentPlaceholder")} rows={8} />
              <div className="flex gap-3">
                <div className="w-1/2 space-y-1">
                  <label htmlFor="wiki-category" className="text-sm font-medium">{t("wiki.category")}</label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger id="wiki-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c !== "Все").map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-1/2 space-y-1">
                  <label htmlFor="wiki-tags" className="text-sm font-medium">{t("wiki.tags")}</label>
                  <Input id="wiki-tags" value={newTags} onChange={e => setNewTags(e.target.value)} placeholder={t("wiki.tagsPlaceholder")} />
                </div>
              </div>
              <div className="flex gap-2">
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <Button variant="outline" type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImg}>
                  {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  {uploadingImg ? t("wiki.uploading") : t("wiki.addImage")}
                </Button>
              </div>
              <Button onClick={handleCreate} className="w-full">{t("common.create")}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("wiki.searchPlaceholder")} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === "Все" ? t("common.all") : c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : article ? (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{article.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><User className="w-3 h-3" />{article.authorName}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(article.updatedAt).toLocaleDateString()}</span>
                <Badge variant="outline" className="text-[10px]">{article.category}</Badge>
              </div>
              <div className="flex gap-1 mt-2">
                {article.tags.map(t => <Badge key={t} className="text-[9px] bg-primary/10 text-primary border-0">{t}</Badge>)}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setArticle(null)}>{t("common.back")}</Button>
          </div>
          <Separator />
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{article.content}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground" role="alert">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">{t("wiki.noArticles")}</p>
            </div>
          )}
          {filtered.map(a => (
            <div key={a.id} onClick={() => setArticle(a)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setArticle(a); } }} role="button" tabIndex={0} className="rounded-xl border bg-card p-4 hover:bg-muted/50 cursor-pointer transition-all space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm leading-snug">{a.title}</h3>
                <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.content}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px]">{a.category}</Badge>
                <div className="flex gap-1">
                  {a.tags.slice(0, 2).map(t => <Badge key={t} className="text-[9px] bg-primary/10 text-primary border-0">{t}</Badge>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
