// KB-02: тумблер «Опубликовать» в диалогах Wiki (admin/senior_agent) —
// published уходит в POST/PUT, состояние видно бейджем, снятие с публикации работает.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WikiPage from '@/pages/Wiki'
import type { ReactNode } from 'react'

const articles = vi.hoisted(() => [
  {
    id: 1,
    title: 'Опубликованная статья',
    content: 'Текст опубликованной статьи',
    category: 'Руководство',
    tags: ['guide'],
    author_id: 1,
    author_name: 'Admin',
    created_at: '2026-01-01',
    updated_at: '2026-06-01',
    published: true,
    slug: 'opublikovannaya-statya',
  },
  {
    id: 2,
    title: 'Неопубликованная статья',
    content: 'Текст черновика',
    category: 'Правила',
    tags: [],
    author_id: 1,
    author_name: 'Admin',
    created_at: '2026-01-02',
    updated_at: '2026-06-02',
    published: false,
    slug: 'neopublikovannaya-statya',
  },
])

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

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key: string) =>
      ({
        'wiki.title': 'База знаний',
        'wiki.description': 'Статьи и инструкции',
        'wiki.searchPlaceholder': 'Поиск...',
        'wiki.create': 'Создать',
        'wiki.createTitle': 'Новая статья',
        'wiki.edit': 'Редактировать',
        'wiki.editTitle': 'Редактирование статьи',
        'wiki.articleTitle': 'Название',
        'wiki.content': 'Содержание',
        'wiki.contentPlaceholder': 'Содержание (Markdown)',
        'wiki.category': 'Категория',
        'wiki.tags': 'Теги',
        'wiki.tagsPlaceholder': 'тег1, тег2',
        'wiki.publish': 'Опубликовать в публичной базе',
        'wiki.publishHint': 'Черновик виден только в портале',
        'wiki.published': 'Опубликовано',
        'wiki.draft': 'Черновик',
        'wiki.exportCSV': 'CSV',
        'wiki.noArticles': 'Статьи не найдены',
        'common.all': 'Все',
        'common.create': 'Создать',
        'common.save': 'Сохранить',
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

vi.mock('@/hooks/useFeature', () => ({
  useFeature: () => false,
}))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Опубликованная статья')
  await user.click(screen.getByRole('button', { name: 'Создать' }))
  return screen.findByRole('dialog')
}

async function fillCreateForm(dialog: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  await user.type(within(dialog).getByLabelText('Название'), 'Новая статья')
  await user.type(within(dialog).getByLabelText('Содержание'), 'Текст новой статьи')
}

describe('Wiki: публикация в /kb (KB-02)', () => {
  beforeEach(() => {
    mockAuth.canManage = true
    mockApi.get.mockReset()
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === '/wiki') return { data: articles }
      return { data: [] }
    })
    mockApi.post.mockReset()
    mockApi.put.mockReset()
  })

  it('создание с включённым тумблером отправляет published: true', async () => {
    const user = userEvent.setup()
    mockApi.post.mockResolvedValue({ ...articles[0], id: 3, title: 'Новая статья' })
    render(<WikiPage />, { wrapper: makeWrapper() })

    const dialog = await openCreateDialog(user)
    await fillCreateForm(dialog, user)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Опубликовать в публичной базе' }))
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/wiki',
        expect.objectContaining({ title: 'Новая статья', published: true }),
      )
    })
  })

  it('по умолчанию создаётся черновик (published: false)', async () => {
    const user = userEvent.setup()
    mockApi.post.mockResolvedValue({ ...articles[1], id: 4, title: 'Новая статья' })
    render(<WikiPage />, { wrapper: makeWrapper() })

    const dialog = await openCreateDialog(user)
    await fillCreateForm(dialog, user)
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/wiki', expect.objectContaining({ published: false }))
    })
  })

  it('редактирование: тумблер предзаполнен, снятие отправляет published: false', async () => {
    const user = userEvent.setup()
    mockApi.put.mockResolvedValue({ ...articles[0], published: false })
    render(<WikiPage />, { wrapper: makeWrapper() })

    await user.click(await screen.findByText('Опубликованная статья'))
    await user.click(screen.getByRole('button', { name: 'Редактировать' }))
    const dialog = await screen.findByRole('dialog')
    const toggle = within(dialog).getByRole('checkbox', { name: 'Опубликовать в публичной базе' })
    expect(toggle).toBeChecked()

    await user.click(toggle)
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/wiki/1', expect.objectContaining({ published: false }))
    })
  })

  it('менеджер видит состояние публикации бейджами', async () => {
    render(<WikiPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Опубликовано')).toBeInTheDocument()
    expect(screen.getByText('Черновик')).toBeInTheDocument()
  })

  it('обычный пользователь не видит бейджи публикации', async () => {
    mockAuth.canManage = false
    render(<WikiPage />, { wrapper: makeWrapper() })
    await screen.findByText('Опубликованная статья')
    expect(screen.queryByText('Опубликовано')).not.toBeInTheDocument()
    expect(screen.queryByText('Черновик')).not.toBeInTheDocument()
  })
})
