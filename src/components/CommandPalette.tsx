import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Search,
  LayoutDashboard,
  Ticket,
  Users,
  MessageSquare,
  Calendar,
  FileText,
  Newspaper,
  BarChart3,
  Settings,
  BookOpen,
  CheckSquare,
} from 'lucide-react'

interface PaletteItem {
  id: string
  label: string
  section: string
  icon: React.ReactNode
  action: () => void
  keywords: string[]
}

export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items: PaletteItem[] = [
    {
      id: 'nav-dashboard',
      label: t('nav.dashboard'),
      section: t('commandPalette.navigation'),
      icon: <LayoutDashboard className="w-4 h-4" />,
      action: () => navigate('/'),
      keywords: ['dashboard', 'главная', 'дашборд'],
    },
    {
      id: 'nav-tickets',
      label: t('nav.tickets'),
      section: t('commandPalette.navigation'),
      icon: <Ticket className="w-4 h-4" />,
      action: () => navigate('/tickets'),
      keywords: ['tickets', 'тикеты', 'заявки'],
    },
    {
      id: 'nav-chats',
      label: t('nav.chats'),
      section: t('commandPalette.navigation'),
      icon: <MessageSquare className="w-4 h-4" />,
      action: () => navigate('/chats'),
      keywords: ['chats', 'чаты', 'сообщения'],
    },
    {
      id: 'nav-employees',
      label: t('nav.employees'),
      section: t('commandPalette.navigation'),
      icon: <Users className="w-4 h-4" />,
      action: () => navigate('/employees'),
      keywords: ['employees', 'сотрудники', 'пользователи'],
    },
    {
      id: 'nav-calendar',
      label: t('nav.calendar'),
      section: t('commandPalette.navigation'),
      icon: <Calendar className="w-4 h-4" />,
      action: () => navigate('/calendar'),
      keywords: ['calendar', 'календарь', 'события'],
    },
    {
      id: 'nav-files',
      label: t('nav.files'),
      section: t('commandPalette.navigation'),
      icon: <FileText className="w-4 h-4" />,
      action: () => navigate('/files'),
      keywords: ['files', 'файлы', 'документы'],
    },
    {
      id: 'nav-wiki',
      label: t('nav.wiki'),
      section: t('commandPalette.navigation'),
      icon: <BookOpen className="w-4 h-4" />,
      action: () => navigate('/wiki'),
      keywords: ['wiki', 'база знаний', 'статьи'],
    },
    {
      id: 'nav-news',
      label: t('nav.news'),
      section: t('commandPalette.navigation'),
      icon: <Newspaper className="w-4 h-4" />,
      action: () => navigate('/news'),
      keywords: ['news', 'новости', 'лента'],
    },
    {
      id: 'nav-polls',
      label: t('nav.polls'),
      section: t('commandPalette.navigation'),
      icon: <CheckSquare className="w-4 h-4" />,
      action: () => navigate('/polls'),
      keywords: ['polls', 'опросы', 'голосование'],
    },
    {
      id: 'nav-kanban',
      label: t('nav.kanban'),
      section: t('commandPalette.navigation'),
      icon: <BarChart3 className="w-4 h-4" />,
      action: () => navigate('/kanban'),
      keywords: ['kanban', 'доска'],
    },
    {
      id: 'nav-admin',
      label: t('nav.admin'),
      section: t('commandPalette.navigation'),
      icon: <Settings className="w-4 h-4" />,
      action: () => navigate('/admin'),
      keywords: ['admin', 'админ', 'настройки'],
    },
    {
      id: 'action-create-ticket',
      label: t('commandPalette.createTicket'),
      section: t('commandPalette.actions'),
      icon: <Ticket className="w-4 h-4" />,
      action: () => navigate('/tickets/new'),
      keywords: ['create', 'создать', 'тикет', 'ticket', 'новый'],
    },
    {
      id: 'action-search',
      label: t('commandPalette.globalSearch'),
      section: t('commandPalette.actions'),
      icon: <Search className="w-4 h-4" />,
      action: () => navigate('/search'),
      keywords: ['search', 'поиск', 'найти'],
    },
  ]

  const filtered = query.trim()
    ? items.filter((item) => {
        const q = query.toLowerCase()
        return item.label.toLowerCase().includes(q) || item.keywords.some((k) => k.includes(q))
      })
    : items

  const grouped = filtered.reduce<Record<string, PaletteItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {})

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOpen((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const executeItem = (item: PaletteItem) => {
    item.action()
    setOpen(false)
  }

  const flatFiltered = Object.values(grouped).flat()

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
      executeItem(flatFiltered[selectedIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg gap-0 overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('commandPalette.placeholder')}
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            ESC
          </kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {flatFiltered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('commandPalette.noResults')}</p>
          ) : (
            Object.entries(grouped).map(([section, sectionItems]) => (
              <div key={section}>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{section}</p>
                {sectionItems.map((item) => {
                  const idx = flatFiltered.indexOf(item)
                  return (
                    <button
                      key={item.id}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                        idx === selectedIndex
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
