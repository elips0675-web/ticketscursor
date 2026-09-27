import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  BookOpen,
  Plus,
  Clock,
  User,
  Layers,
  ImageIcon,
  Download,
  History,
  Pencil,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import type { WikiArticle } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { SkeletonCardGrid } from '@/components/skeletons'
import { useFeature } from '@/hooks/useFeature'
import { diffLines, diffStats, type DiffLine } from '@/lib/wiki-diff'

function mapArticle(raw: Record<string, unknown>): WikiArticle {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    category: raw.category,
    tags: typeof raw.tags === 'string' ? JSON.parse(raw.tags) : raw.tags || [],
    authorId: raw.author_id,
    authorName: raw.author_name,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

const CATEGORIES = ['Все', 'Руководство', 'Правила', 'Инструкции', 'FAQ', 'Интеграции']

interface WikiRevision {
  id: number
  article_id: number
  revision: number
  title: string
  content: string
  category: string
  tags: string[] | string
  author_name?: string | null
  created_at: string
}

function mapRevision(raw: Record<string, unknown>): WikiRevision {
  return {
    id: raw.id as number,
    article_id: raw.article_id as number,
    revision: raw.revision as number,
    title: raw.title as string,
    content: raw.content as string,
    category: (raw.category as string) || 'Другое',
    tags: typeof raw.tags === 'string' ? JSON.parse(raw.tags) : (raw.tags as string[]) || [],
    author_name: raw.author_name as string | null,
    created_at: raw.created_at as string,
  }
}

export default function WikiPage() {
  const { canManage } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Все')
  const [article, setArticle] = useState<WikiArticle | null>(null)
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('Руководство')
  const [newTags, setNewTags] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

  // — Этап 65: версионирование Wiki (флаг wiki_versioning) + редактирование —
  const versioningEnabled = useFeature('wiki_versioning')
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState('Руководство')
  const [editTags, setEditTags] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const [revisions, setRevisions] = useState<WikiRevision[]>([])
  const [selectedRev, setSelectedRev] = useState<WikiRevision | null>(null)
  const [revisionLoading, setRevisionLoading] = useState(false)
  const [rollbackPending, setRollbackPending] = useState(false)

  const diff: DiffLine[] = useMemo(
    () => (article && selectedRev ? diffLines(article.content, selectedRev.content) : []),
    [article, selectedRev],
  )
  const diffStat = useMemo(() => diffStats(diff), [diff])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    const form = new FormData()
    form.append('image', file)
    try {
      const { url } = await api.post('/wiki/upload-image', form)
      setNewContent((prev) => prev + `\n\n![${file.name}](${url})\n`)
    } catch {
      /* toast handled by api client */
    }
    setUploadingImg(false)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const articlesQuery = useQuery({
    queryKey: ['wiki'],
    queryFn: () =>
      api.get('/wiki').then((data) => ((data?.data || data || []) as Record<string, unknown>[]).map(mapArticle)),
  })

  const loading = articlesQuery.isLoading

  const filtered = useMemo(() => {
    const articles = articlesQuery.data ?? []
    let items = articles
    if (category !== 'Все') items = items.filter((a) => a.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)),
      )
    }
    return items
  }, [articlesQuery.data, search, category])

  const createMutation = useMutation({
    mutationFn: () => {
      if (!newTitle.trim() || !newContent.trim()) return Promise.reject(new Error('Invalid form'))
      return api.post('/wiki', {
        title: newTitle,
        content: newContent,
        category: newCategory,
        tags: newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['wiki'] })
      setArticle(mapArticle(created))
      setOpen(false)
      setNewTitle('')
      setNewContent('')
      setNewCategory('Руководство')
      setNewTags('')
    },
  })

  const editMutation = useMutation({
    mutationFn: (id: number) => {
      if (!editTitle.trim() || !editContent.trim()) return Promise.reject(new Error('Invalid form'))
      return api.put(`/wiki/${id}`, {
        title: editTitle,
        content: editContent,
        category: editCategory,
        tags: editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['wiki'] })
      setArticle(mapArticle(updated))
      setEditOpen(false)
    },
  })

  const openEdit = (a: WikiArticle) => {
    setEditTitle(a.title)
    setEditContent(a.content)
    setEditCategory(a.category)
    setEditTags((a.tags || []).join(', '))
    setEditOpen(true)
  }

  const openHistory = async () => {
    if (!article) return
    setHistOpen(true)
    setRevisionLoading(true)
    setSelectedRev(null)
    try {
      const data = await api.get(`/wiki/${article.id}/revisions`)
      setRevisions(((data?.data || data || []) as Record<string, unknown>[]).map(mapRevision))
    } catch {
      /* toast handled by api client */
      setRevisions([])
    }
    setRevisionLoading(false)
  }

  const rollbackTo = async (rev: WikiRevision) => {
    if (!article || rollbackPending) return
    setRollbackPending(true)
    try {
      const updated = await api.post(`/wiki/${article.id}/rollback/${rev.id}`)
      queryClient.invalidateQueries({ queryKey: ['wiki'] })
      setArticle(mapArticle(updated))
      setHistOpen(false)
    } catch {
      /* toast handled by api client */
    }
    setRollbackPending(false)
  }

  const exportCSV = () => {
    const data = filtered
    const headers = ['ID', 'Название', 'Категория', 'Теги', 'Автор', 'Создано', 'Обновлено']
    const rows = data.map((a) => [
      a.id,
      `"${a.title.replace(/"/g, '""')}"`,
      a.category,
      `"${(a.tags || []).join(', ')}"`,
      a.authorName,
      new Date(a.createdAt).toLocaleDateString(),
      new Date(a.updatedAt).toLocaleDateString(),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wiki-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            {t('wiki.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('wiki.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" />
            {t('wiki.exportCSV')}
          </Button>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  {t('wiki.create')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>{t('wiki.createTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <label htmlFor="wiki-title" className="text-sm font-medium">
                    {t('wiki.articleTitle')}
                  </label>
                  <Input
                    id="wiki-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={t('wiki.articleTitle')}
                  />
                  <label htmlFor="wiki-content" className="text-sm font-medium">
                    {t('wiki.content')}
                  </label>
                  <Textarea
                    id="wiki-content"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder={t('wiki.contentPlaceholder')}
                    rows={8}
                  />
                  <div className="flex gap-3">
                    <div className="w-1/2 space-y-1">
                      <label htmlFor="wiki-category" className="text-sm font-medium">
                        {t('wiki.category')}
                      </label>
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger id="wiki-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter((c) => c !== 'Все').map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-1/2 space-y-1">
                      <label htmlFor="wiki-tags" className="text-sm font-medium">
                        {t('wiki.tags')}
                      </label>
                      <Input
                        id="wiki-tags"
                        value={newTags}
                        onChange={(e) => setNewTags(e.target.value)}
                        placeholder={t('wiki.tagsPlaceholder')}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImg}
                    >
                      {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      {uploadingImg ? t('wiki.uploading') : t('wiki.addImage')}
                    </Button>
                  </div>
                  <Button
                    onClick={() => createMutation.mutate()}
                    className="w-full"
                    disabled={createMutation.isPending}
                  >
                    {t('common.create')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('wiki.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === 'Все' ? t('common.all') : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SkeletonCardGrid count={6} cols={2} />
      ) : article ? (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{article.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {article.authorName}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(article.updatedAt).toLocaleDateString()}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {article.category}
                </Badge>
              </div>
              <div className="flex gap-1 mt-2">
                {article.tags.map((t) => (
                  <Badge key={t} className="text-[9px] bg-primary/10 text-primary border-0">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {versioningEnabled && (
                <Button variant="outline" size="sm" onClick={openHistory}>
                  <History className="w-3.5 h-3.5 mr-1" />
                  {t('wiki.history')}
                </Button>
              )}
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => openEdit(article)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  {t('wiki.edit')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setArticle(null)}>
                {t('common.back')}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{article.content}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground" role="alert">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">{t('wiki.noArticles')}</p>
            </div>
          )}
          {filtered.map((a) => (
            <div
              key={a.id}
              onClick={() => setArticle(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setArticle(a)
                }
              }}
              role="button"
              tabIndex={0}
              className="rounded-xl border bg-card p-4 hover:bg-muted/50 cursor-pointer transition-all space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm leading-snug">{a.title}</h3>
                <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.content}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px]">
                  {a.category}
                </Badge>
                <div className="flex gap-1">
                  {a.tags.slice(0, 2).map((t) => (
                    <Badge key={t} className="text-[9px] bg-primary/10 text-primary border-0">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* — Этап 65: диалог редактирования (PUT /wiki/:id + ревизия) — */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('wiki.editTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="wiki-edit-title" className="text-sm font-medium">
              {t('wiki.articleTitle')}
            </label>
            <Input id="wiki-edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <label htmlFor="wiki-edit-content" className="text-sm font-medium">
              {t('wiki.content')}
            </label>
            <Textarea
              id="wiki-edit-content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
            />
            <div className="flex gap-3">
              <div className="w-1/2 space-y-1">
                <label htmlFor="wiki-edit-category" className="text-sm font-medium">
                  {t('wiki.category')}
                </label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger id="wiki-edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c !== 'Все').map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-1/2 space-y-1">
                <label htmlFor="wiki-edit-tags" className="text-sm font-medium">
                  {t('wiki.tags')}
                </label>
                <Input
                  id="wiki-edit-tags"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder={t('wiki.tagsPlaceholder')}
                />
              </div>
            </div>
            {versioningEnabled && <p className="text-xs text-muted-foreground">{t('wiki.editCreatesRevision')}</p>}
            <Button
              onClick={() => article && editMutation.mutate(article.id)}
              className="w-full"
              disabled={editMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* — Этап 65: история версий (list + diff + rollback, флаг wiki_versioning) — */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('wiki.historyTitle')}</DialogTitle>
          </DialogHeader>
          {revisionLoading ? (
            <div className="space-y-2 py-4">
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('wiki.noRevisions')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3 overflow-y-auto min-h-40">
              <div className="space-y-1">
                {revisions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRev(r)}
                    className={`w-full text-left text-xs rounded-lg border px-3 py-2 transition-colors ${
                      selectedRev?.id === r.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="font-bold">#{r.revision}</span>{' '}
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    {r.author_name && <div className="text-muted-foreground mt-0.5">{r.author_name}</div>}
                  </button>
                ))}
              </div>
              <div>
                {selectedRev ? (
                  <>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>
                        {t('wiki.diffFromCurrent')} #{selectedRev.revision}
                      </span>
                      <Badge variant="outline">
                        +{diffStat.added} / −{diffStat.removed}
                      </Badge>
                    </div>
                    <div className="text-xs font-mono whitespace-pre-wrap border rounded-lg p-3 max-h-64 overflow-y-auto">
                      {diff.map((l, i) => (
                        <div
                          key={i}
                          className={
                            l.type === 'add'
                              ? 'bg-green-500/10 text-green-700'
                              : l.type === 'del'
                                ? 'bg-red-500/10 text-red-600 line-through'
                                : ''
                          }
                        >
                          {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                          {l.text}
                        </div>
                      ))}
                    </div>
                    {canManage && (
                      <Button className="mt-3 gap-2" disabled={rollbackPending} onClick={() => rollbackTo(selectedRev)}>
                        <RotateCcw className="w-4 h-4" />
                        {t('wiki.rollback')}
                      </Button>
                    )}
                    {!canManage && (
                      <p className="text-xs text-muted-foreground mt-3">{t('wiki.rollbackManagerOnly')}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('wiki.selectRevision')}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
