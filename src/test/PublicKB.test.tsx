import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PublicKB from '@/pages/PublicKB'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'kb.title': 'База знаний',
        'kb.subtitle': 'Публичная база знаний',
        'kb.searchPlaceholder': 'Поиск по статьям',
        'kb.search': 'Найти',
        'kb.allCategories': 'Все категории',
        'kb.empty': 'Статьи не найдены',
        'kb.noExcerpt': 'Нет описания',
        'common.prev': 'Назад',
        'common.next': 'Вперёд',
      })[key] || key,
  }),
}))

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

const mockArticles = {
  data: [
    { id: 1, title: 'Настройка VPN', slug: 'vpn-setup', content: 'Инструкция', category: 'Сеть', created_at: '2026-09-01T10:00:00Z', excerpt: 'Как настроить' },
    { id: 2, title: 'Сброс пароля', slug: null, content: 'Инструкция', category: 'Аккаунты', created_at: null, excerpt: 'Восстановление' },
  ],
  pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
}

describe('PublicKB', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.get.mockResolvedValue(mockArticles)
  })

  it('renders title and articles', async () => {
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    expect(await screen.findByText('База знаний')).toBeInTheDocument()
    expect(await screen.findByText('Настройка VPN')).toBeInTheDocument()
    expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
  })

  it('fetches categories and renders category buttons', async () => {
    mockApi.get.mockResolvedValueOnce(mockArticles).mockResolvedValueOnce(['Сеть', 'Аккаунты'])
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      expect(buttons.some((b) => b.textContent?.includes('Сеть'))).toBe(true)
      expect(buttons.some((b) => b.textContent?.includes('Аккаунты'))).toBe(true)
    })
  })

  it('filters by search query', async () => {
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    const input = await screen.findByPlaceholderText('Поиск по статьям')
    fireEvent.change(input, { target: { value: 'VPN' } })
    fireEvent.click(screen.getByText('Найти'))
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/kb/articles?page=1&limit=12&q=VPN')
    })
  })

  it('filters by category', async () => {
    mockApi.get.mockResolvedValueOnce(mockArticles).mockResolvedValueOnce(['Сеть', 'Аккаунты'])
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    let catBtn: HTMLElement | undefined
    await waitFor(() => {
      catBtn = screen.getAllByRole('button').find((b) => b.textContent?.trim() === 'Сеть')
      expect(catBtn).toBeTruthy()
    })
    if (catBtn) fireEvent.click(catBtn)
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/kb/articles?page=1&limit=12&category=%D0%A1%D0%B5%D1%82%D1%8C')
    })
  })

  it('shows empty state', async () => {
    mockApi.get.mockResolvedValue({ data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } })
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    expect(await screen.findByText('Статьи не найдены')).toBeInTheDocument()
  })

  it('handles API failure with empty state', async () => {
    mockApi.get.mockRejectedValue(new Error('fail'))
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    expect(await screen.findByText('Статьи не найдены')).toBeInTheDocument()
  })

  it('renders pagination when multiple pages', async () => {
    mockApi.get.mockResolvedValue({
      data: [{ id: 1, title: 'A', slug: 'a', content: '', category: null, created_at: null, excerpt: '' }],
      pagination: { page: 1, limit: 12, total: 25, totalPages: 3 },
    })
    render(
      <MemoryRouter>
        <PublicKB />
      </MemoryRouter>
    )
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Вперёд →'))
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/kb/articles?page=2&limit=12')
    })
  })
})