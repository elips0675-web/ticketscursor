import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WikiPage from '@/pages/Wiki'
import type { ReactNode } from 'react'

const mockArticles = vi.hoisted(() => [
  {
    id: 1,
    title: 'Getting Started',
    content: 'How to use the system',
    category: 'Руководство',
    tags: ['guide', 'basics'],
    author_id: 1,
    author_name: 'Admin',
    created_at: '2026-01-01',
    updated_at: '2026-06-01',
  },
  {
    id: 2,
    title: 'Security Policy',
    content: 'Company security rules',
    category: 'Правила',
    tags: ['security'],
    author_id: 2,
    author_name: 'User B',
    created_at: '2026-02-01',
    updated_at: '2026-05-15',
  },
  {
    id: 3,
    title: 'VPN Setup',
    content: 'How to configure VPN',
    category: 'Инструкции',
    tags: ['vpn', 'network'],
    author_id: 1,
    author_name: 'Admin',
    created_at: '2026-03-01',
    updated_at: '2026-06-10',
  },
  {
    id: 4,
    title: 'Reset Password',
    content: 'Steps to reset password',
    category: 'FAQ',
    tags: ['password'],
    author_id: 3,
    author_name: 'User C',
    created_at: '2026-04-01',
    updated_at: '2026-06-05',
  },
])

const mockApi = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({}),
  put: vi.fn(),
  delete: vi.fn(),
}))

const mockAuth = vi.hoisted(() => ({
  canManage: false,
  user: { id: 1, name: 'Admin', role: 'admin' },
  token: 'test',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key: string) =>
      ({
        'wiki.title': 'База знаний',
        'wiki.description': 'Статьи и инструкции',
        'wiki.searchPlaceholder': 'Поиск по статьям...',
        'wiki.create': 'Создать',
        'wiki.createTitle': 'Новая статья',
        'wiki.articleTitle': 'Заголовок',
        'wiki.content': 'Содержание',
        'wiki.contentPlaceholder': 'Введите текст статьи...',
        'wiki.category': 'Категория',
        'wiki.tags': 'Теги',
        'wiki.tagsPlaceholder': 'тег1, тег2',
        'wiki.exportCSV': 'CSV',
        'wiki.addImage': 'Изображение',
        'wiki.uploading': 'Загрузка...',
        'wiki.noArticles': 'Статьи не найдены',
        'common.all': 'Все',
        'common.create': 'Создать',
        'common.back': 'Назад',
      })[key] || key
    return { t }
  },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('Wiki', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.get.mockResolvedValue({ data: mockArticles })
    mockAuth.canManage = false
  })

  it('renders title', async () => {
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('База знаний')).toBeInTheDocument()
  })

  it('renders article cards', async () => {
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText('Security Policy')).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}))
    render(<WikiPage />, { wrapper: makeWrapper() })
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Статьи не найдены')).toBeInTheDocument()
  })

  it('filters by search', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Getting Started')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Поиск по статьям...'), 'Security')
    await waitFor(() => {
      expect(screen.queryByText('Getting Started')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Security Policy')).toBeInTheDocument()
  })

  it('opens article detail on click', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    const btn = (await screen.findByText('Getting Started')).closest('[role="button"]')
    if (btn) await user.click(btn)
    expect(await screen.findByText('How to use the system')).toBeInTheDocument()
  })

  it('shows back button in detail', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    const btn = (await screen.findByText('Getting Started')).closest('[role="button"]')
    if (btn) await user.click(btn)
    expect(await screen.findByText('Назад')).toBeInTheDocument()
  })

  it('shows article metadata', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    const btn = (await screen.findByText('Getting Started')).closest('[role="button"]')
    if (btn) await user.click(btn)
    expect(await screen.findByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Руководство')).toBeInTheDocument()
  })

  it('hides create when cannot manage', async () => {
    render(<WikiPage />, { wrapper: makeWrapper() })
    await screen.findByText('База знаний')
    expect(screen.queryByText('Создать')).not.toBeInTheDocument()
  })

  it('shows create when can manage', async () => {
    mockAuth.canManage = true
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Создать')).toBeInTheDocument()
  })

  it('shows tags', async () => {
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('guide')).toBeInTheDocument()
  })

  it('exports CSV', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('CSV')).toBeInTheDocument()
    await user.click(screen.getByText('CSV'))
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('navigates with enter key', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    const btn = (await screen.findByText('Getting Started')).closest('[role="button"]')
    if (btn) await user.type(btn, '{enter}')
    expect(await screen.findByText('How to use the system')).toBeInTheDocument()
  })

  it('goes back from detail', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    const btn = (await screen.findByText('Getting Started')).closest('[role="button"]')
    if (btn) await user.click(btn)
    await screen.findByText('How to use the system')
    await user.click(screen.getByText('Назад'))
    await waitFor(() => {
      expect(screen.getByText('Getting Started')).toBeInTheDocument()
    })
  })
})
