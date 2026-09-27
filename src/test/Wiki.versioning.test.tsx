import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WikiPage from '@/pages/Wiki'
import type { ReactNode } from 'react'

const mockArticles = [
  {
    id: 1,
    title: 'Getting Started',
    content: 'How to use the system',
    category: 'Руководство',
    tags: ['guide'],
    author_id: 1,
    author_name: 'Admin',
    created_at: '2026-01-01',
    updated_at: '2026-06-01',
  },
]

const revisions = [
  {
    id: 2,
    article_id: 1,
    revision: 2,
    title: 'Getting Started v2',
    content: 'How to use the system, now with VPN',
    category: 'Руководство',
    tags: ['guide', 'vpn'],
    author_id: 1,
    author_name: 'Admin',
    created_at: '2026-06-02',
  },
  {
    id: 1,
    article_id: 1,
    revision: 1,
    title: 'Getting Started',
    content: 'Get started quickly',
    category: 'Руководство',
    tags: ['guide'],
    author_id: 2,
    author_name: 'User B',
    created_at: '2026-01-01',
  },
]

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

const mockAuth = vi.hoisted(() => ({
  canManage: true,
  user: { id: 1, name: 'Admin', role: 'admin' },
  token: 'test',
}))

const flags = vi.hoisted(() => ({ versioning: true }))

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key: string) =>
      ({
        'wiki.title': 'База знаний',
        'wiki.searchPlaceholder': 'Поиск...',
        'wiki.create': 'Создать',
        'wiki.edit': 'Редактировать',
        'wiki.editTitle': 'Редактирование статьи',
        'wiki.editCreatesRevision': 'Будет создана новая версия',
        'wiki.articleTitle': 'Заголовок',
        'wiki.content': 'Содержание',
        'wiki.category': 'Категория',
        'wiki.tags': 'Теги',
        'wiki.tagsPlaceholder': 'тег1, тег2',
        'wiki.exportCSV': 'CSV',
        'wiki.noArticles': 'Статьи не найдены',
        'wiki.history': 'История',
        'wiki.historyTitle': 'История версий',
        'wiki.noRevisions': 'Версий пока нет',
        'wiki.selectRevision': 'Выберите версию слева',
        'wiki.diffFromCurrent': 'Изменения от текущей версии к',
        'wiki.rollback': 'Откатить к этой версии',
        'wiki.rollbackManagerOnly': 'Откат доступен администраторам и старшим агентам',
        'common.back': 'Назад',
        'common.save': 'Сохранить',
        'common.all': 'Все',
      })[key] || key
    return { t }
  },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useFeature', () => ({
  useFeature: (key: string) => (key === 'wiki_versioning' ? flags.versioning : true),
}))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

async function openFirstArticle(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
  await user.click(screen.getByText('Getting Started'))
}

describe('Wiki versioning (Этап 65, флаг wiki_versioning)', () => {
  beforeEach(() => {
    flags.versioning = true
    mockAuth.canManage = true
    mockApi.get.mockReset()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/wiki/1/revisions') return Promise.resolve({ data: revisions })
      return Promise.resolve({ data: mockArticles })
    })
    mockApi.put.mockReset()
    mockApi.post.mockReset()
  })

  it('редактирование статьи (admin): диалог prefilled, PUT, обновление в UI', async () => {
    const user = userEvent.setup()
    mockApi.put.mockResolvedValue({ ...mockArticles[0], title: 'Getting Started v2' })
    render(<WikiPage />, { wrapper: makeWrapper() })
    await openFirstArticle(user)

    await user.click(screen.getByRole('button', { name: 'Редактировать' }))
    expect(screen.getByText('Редактирование статьи')).toBeInTheDocument()
    const titleInput = screen.getByLabelText('Заголовок')
    expect(titleInput).toHaveValue('Getting Started')
    await user.clear(titleInput)
    await user.type(titleInput, 'Getting Started v2')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(mockApi.put).toHaveBeenCalledWith(
      '/wiki/1',
      expect.objectContaining({ title: 'Getting Started v2', category: 'Руководство', tags: ['guide'] }),
    )
    await waitFor(() => expect(screen.getByText('Getting Started v2')).toBeInTheDocument())
  })

  it('история версий: список ревизий, выбор → diff со статистикой', async () => {
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    await openFirstArticle(user)

    await user.click(screen.getByRole('button', { name: /История/ }))
    expect(screen.getByText('История версий')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/wiki/1/revisions')

    await waitFor(() => expect(screen.getByText('#2')).toBeInTheDocument())
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('User B')).toBeInTheDocument()

    await user.click(screen.getByText('#1'))
    // diff: статья «How to use the system» против ревизии «Get started quickly»
    expect(screen.getByText(/Изменения от текущей версии к #1/)).toBeInTheDocument()
    expect(screen.getByText('+1 / −1')).toBeInTheDocument()
  })

  it('откат к ревизии (admin): POST rollback → статья обновлена, диалог закрыт', async () => {
    const user = userEvent.setup()
    mockApi.post.mockResolvedValue({ ...mockArticles[0], title: 'Getting Started', content: 'Get started quickly' })
    render(<WikiPage />, { wrapper: makeWrapper() })
    await openFirstArticle(user)

    await user.click(screen.getByRole('button', { name: /История/ }))
    await waitFor(() => screen.getByText('#1'))
    await user.click(screen.getByText('#1'))
    await user.click(screen.getByRole('button', { name: 'Откатить к этой версии' }))

    expect(mockApi.post).toHaveBeenCalledWith('/wiki/1/rollback/1')
    await waitFor(() => expect(screen.queryByText('История версий')).not.toBeInTheDocument())
    expect(screen.getByText('Get started quickly')).toBeInTheDocument()
  })

  it('agent (canManage=false): нет «Редактировать» и «Откатить»', async () => {
    mockAuth.canManage = false
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    await openFirstArticle(user)

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /История/ }))
    await waitFor(() => screen.getByText('#1'))
    await user.click(screen.getByText('#1'))
    expect(screen.getByText('Откат доступен администраторам и старшим агентам')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Откатить к этой версии' })).not.toBeInTheDocument()
  })

  it('флаг off: кнопка «История» скрыта, редактирование остаётся', async () => {
    flags.versioning = false
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    await openFirstArticle(user)

    expect(screen.queryByRole('button', { name: /История/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
  })

  it('пустая история: сообщение «Версий пока нет»', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/wiki/1/revisions') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: mockArticles })
    })
    const user = userEvent.setup()
    render(<WikiPage />, { wrapper: makeWrapper() })
    await openFirstArticle(user)
    await user.click(screen.getByRole('button', { name: /История/ }))
    await waitFor(() => expect(screen.getByText('Версий пока нет')).toBeInTheDocument())
  })
})
