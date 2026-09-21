import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Search, BookOpen, Tag, ThumbsUp, ThumbsDown, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'

interface Article {
  id: number
  title: string
  slug: string | null
  content: string | null
  category: string | null
  created_at: string | null
  excerpt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function PublicKB() {
  const { t } = useTranslation()
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 12, total: 0, totalPages: 0 })

  const fetchArticles = async (page = 1, q = search, cat = selectedCategory) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' })
      if (q) params.set('q', q)
      if (cat) params.set('category', cat)
      const d = await api.get(`/kb/articles?${params}`)
      setArticles(d.data || [])
      setPagination(d.pagination || { page: 1, limit: 12, total: 0, totalPages: 0 })
    } catch {
      setArticles([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchArticles()
    api
      .get('/kb/categories')
      .then((d: string[]) => setCategories(d || []))
      .catch(() => {})
  }, [])

  const handleSearch = () => fetchArticles(1, search)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-2">
          <BookOpen className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">{t('kb.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('kb.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 max-w-xl mx-auto">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('kb.searchPlaceholder')}
            className="flex-1"
          />
          <Button onClick={handleSearch} className="shrink-0 gap-1.5">
            <Search className="w-4 h-4" />
            {t('kb.search')}
          </Button>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              size="sm"
              variant={selectedCategory === '' ? 'default' : 'outline'}
              onClick={() => {
                setSelectedCategory('')
                fetchArticles(1, search, '')
              }}
            >
              {t('kb.allCategories')}
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedCategory(cat)
                  fetchArticles(1, search, cat)
                }}
              >
                <Tag className="w-3 h-3 mr-1" />
                {cat}
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('kb.empty')}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {articles.map((article) => (
                <Link key={article.id} to={`/kb/${article.slug || article.id}`}>
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm leading-tight">{article.title}</CardTitle>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      {article.category && (
                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {article.category}
                        </span>
                      )}
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-xs line-clamp-3">
                        {article.excerpt || t('kb.noExcerpt')}
                      </CardDescription>
                      {article.created_at && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {new Date(article.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => fetchArticles(pagination.page - 1)}
                >
                  ← {t('common.prev')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchArticles(pagination.page + 1)}
                >
                  {t('common.next')} →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
