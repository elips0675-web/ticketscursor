import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search as SearchIcon,
  Ticket,
  User,
  BookOpen,
  Newspaper,
  MessageCircle,
  FileText,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

interface SearchResult {
  tickets: any[]
  employees: any[]
  wiki: any[]
  news: any[]
  chats: any[]
  files: any[]
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>({
    tickets: [],
    employees: [],
    wiki: [],
    news: [],
    chats: [],
    files: [],
  })
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults({ tickets: [], employees: [], wiki: [], news: [], chats: [], files: [] })
      setSearched(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.get(`/search?q=${encodeURIComponent(q)}`)
        setResults(data || { tickets: [], employees: [], wiki: [], news: [], chats: [], files: [] })
      } catch {
        /* toast handled by api client */
      } finally {
        setLoading(false)
        setSearched(true)
      }
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  const total = Object.values(results).reduce((a, b) => a + b.length, 0)

  return (
    <div className="mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Глобальный поиск</h1>
        <p className="text-muted-foreground text-sm">
          Поиск по тикетам, сотрудникам, базе знаний, новостям, чатам и файлам
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите запрос (минимум 2 символа)..."
          className="pl-10 h-12 text-base"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && searched && total === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Ничего не найдено</p>
          <p className="text-sm">Попробуйте изменить запрос</p>
        </div>
      )}

      {!loading && total > 0 && (
        <div className="space-y-8">
          <Section
            title="Тикеты"
            icon={Ticket}
            results={results.tickets}
            href={(r) => `/tickets/${r.id}`}
            label={(r) => r.title}
            meta={(r) => (
              <div className="flex gap-2">
                <Badge
                  variant={r.status === 'open' ? 'default' : r.status === 'in_progress' ? 'secondary' : 'outline'}
                  className="text-[10px]"
                >
                  {r.status}
                </Badge>
                <Badge
                  variant={r.priority === 'critical' ? 'destructive' : r.priority === 'high' ? 'default' : 'secondary'}
                  className="text-[10px]"
                >
                  {r.priority}
                </Badge>
              </div>
            )}
          />
          <Section
            title="Сотрудники"
            icon={User}
            results={results.employees}
            href={(_r) => `/employees`}
            label={(r) => r.name}
            meta={(r) => (
              <span className="text-xs text-muted-foreground">
                {r.email} {r.department ? `· ${r.department}` : ''}
              </span>
            )}
          />
          <Section
            title="База знаний"
            icon={BookOpen}
            results={results.wiki}
            href={(r) => `/wiki`}
            label={(r) => r.title}
            meta={(r) =>
              r.category ? (
                <Badge variant="outline" className="text-[10px]">
                  {r.category}
                </Badge>
              ) : null
            }
          />
          <Section
            title="Новости"
            icon={Newspaper}
            results={results.news}
            href={(_r) => `/news`}
            label={(r) => r.title}
            meta={() => null}
          />
          <Section
            title="Чаты"
            icon={MessageCircle}
            results={results.chats}
            href={(r) => `/chats/${r.id}`}
            label={(r) => r.name}
            meta={() => null}
          />
          <Section
            title="Файлы"
            icon={FileText}
            results={results.files}
            href={(_r) => `/files`}
            label={(r) => r.original_name || r.name}
            meta={(r) => (
              <span className="text-xs text-muted-foreground">
                {r.mime_type} · {(r.size / 1024).toFixed(1)} KB
              </span>
            )}
          />
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  results,
  href,
  label,
  meta,
}: {
  title: string
  icon: any
  results: any[]
  href: (r: any) => string
  label: (r: any) => string
  meta: (r: any) => React.ReactNode
}) {
  const navigate = useNavigate()
  if (results.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm">{title}</h2>
        <span className="text-xs text-muted-foreground">({results.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {results.map((r: any) => (
          <button
            key={r.id}
            onClick={() => navigate(href(r))}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:shadow-md transition-all text-left group"
          >
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate flex-1">{label(r)}</span>
            <div className="flex items-center gap-2 shrink-0">
              {meta(r)}
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
