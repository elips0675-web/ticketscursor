import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, ThumbsUp, ThumbsDown, BookOpen, Tag, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface Article {
  id: number
  title: string
  slug: string | null
  content: string | null
  category: string | null
  created_at: string | null
  updated_at: string | null
  votes: { up: number; down: number }
  similar: { id: number; title: string; slug: string | null; category: string | null }[]
}

export default function PublicKBArticle() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    api
      .get(`/kb/articles/${slug}`)
      .then((d: Article) => {
        setArticle(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t('kb.notFound'))
        setLoading(false)
      })
  }, [slug])

  const vote = async (type: 'up' | 'down') => {
    if (!article || voted) return
    try {
      await api.post(`/kb/articles/${article.id}/vote`, { vote: type })
      setArticle((prev) =>
        prev
          ? {
              ...prev,
              votes: { ...prev.votes, [type]: prev.votes[type] + 1 },
            }
          : null,
      )
      setVoted(type)
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 space-y-3">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">{error || t('kb.notFound')}</p>
            <Button variant="outline" asChild>
              <Link to="/kb">{t('kb.backToList')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Link to="/kb" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-4 h-4" /> {t('kb.backToList')}
        </Link>

        <article className="space-y-4">
          <div>
            {article.category && (
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1 mb-2">
                <Tag className="w-3 h-3" /> {article.category}
              </span>
            )}
            <h1 className="text-2xl font-bold">{article.title}</h1>
            {article.created_at && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(article.created_at).toLocaleDateString()}
                {article.updated_at &&
                  article.updated_at !== article.created_at &&
                  ` · ${t('kb.updated')}: ${new Date(article.updated_at).toLocaleDateString()}`}
              </p>
            )}
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap text-sm leading-relaxed">
                {article.content || t('kb.noContent')}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 py-4 border-t border-b">
            <span className="text-xs text-muted-foreground">{t('kb.helpful')}:</span>
            <Button
              size="sm"
              variant={voted === 'up' ? 'default' : 'outline'}
              onClick={() => vote('up')}
              disabled={!!voted}
              className="gap-1"
            >
              <ThumbsUp className="w-3 h-3" /> {article.votes.up}
            </Button>
            <Button
              size="sm"
              variant={voted === 'down' ? 'default' : 'outline'}
              onClick={() => vote('down')}
              disabled={!!voted}
              className="gap-1"
            >
              <ThumbsDown className="w-3 h-3" /> {article.votes.down}
            </Button>
          </div>

          {article.similar.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" /> {t('kb.similarArticles')}
              </h2>
              {article.similar.map((s) => (
                <Link key={s.id} to={`/kb/${s.slug || s.id}`}>
                  <Card className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <span className="text-sm">{s.title}</span>
                      {s.category && (
                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {s.category}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
