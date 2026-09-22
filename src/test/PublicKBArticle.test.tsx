import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PublicKBArticle from '@/pages/PublicKBArticle'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'kb.notFound': 'Статья не найдена',
        'kb.backToList': 'К списку статей',
        'kb.noContent': 'Нет содержимого',
        'kb.updated': 'обновлено',
        'kb.helpful': 'Было полезно',
        'kb.similarArticles': 'Похожие статьи',
      })[key] || key,
  }),
}))

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

const mockArticle = {
  id: 10,
  title: 'Настройка VPN',
  slug: 'vpn-setup',
  content: 'Шаг 1: скачайте приложение',
  category: 'Сеть',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-05T10:00:00Z',
  votes: { up: 5, down: 1 },
  similar: [{ id: 11, title: 'Сброс пароля', slug: 'reset-pass', category: 'Аккаунты' }],
}

function renderArticle(initialEntry = '/kb/vpn-setup') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/kb/:slug" element={<PublicKBArticle />} />
        <Route path="/kb" element={<div>KB List</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PublicKBArticle', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockApi.get.mockResolvedValue(mockArticle)
    mockApi.post.mockResolvedValue({})
  })

  it('renders article content', async () => {
    renderArticle()
    expect(await screen.findByText('Настройка VPN')).toBeInTheDocument()
    expect(screen.getByText(/Шаг 1: скачайте приложение/)).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('fetches article by slug', async () => {
    renderArticle()
    await screen.findByText('Настройка VPN')
    expect(mockApi.get).toHaveBeenCalledWith('/kb/articles/vpn-setup')
  })

  it('renders similar articles', async () => {
    renderArticle()
    expect(await screen.findByText('Сброс пароля')).toBeInTheDocument()
    expect(screen.getByText('Похожие статьи')).toBeInTheDocument()
  })

  it('votes up and increments counter once', async () => {
    renderArticle()
    await screen.findByText('Настройка VPN')
    const upBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('5'))
    expect(upBtn).toBeTruthy()
    if (upBtn) fireEvent.click(upBtn)
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/kb/articles/10/vote', { vote: 'up' })
    })
    expect(await screen.findByText('6')).toBeInTheDocument()
    if (upBtn) fireEvent.click(upBtn)
    expect(mockApi.post).toHaveBeenCalledTimes(1)
  })

  it('shows not found error for missing article', async () => {
    mockApi.get.mockRejectedValue(new Error('Статья не найдена'))
    renderArticle('/kb/nope')
    expect(await screen.findByText('Статья не найдена')).toBeInTheDocument()
    expect(screen.getByText('К списку статей')).toBeInTheDocument()
  })

  it('shows updated date when article was modified', async () => {
    renderArticle()
    expect(await screen.findByText(/обновлено/)).toBeInTheDocument()
  })
})