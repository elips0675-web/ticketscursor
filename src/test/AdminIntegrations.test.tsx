import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiTokensSection, WebhooksSection } from '@/pages/AdminIntegrations'
import { toast } from 'sonner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'admin.apiTokens': 'API токены',
        'admin.apiTokensSubtitle': 'Токены для интеграций',
        'admin.apiTokenName': 'Название токена',
        'admin.apiTokenWarning': 'Скопируйте токен',
        'admin.apiTokensEmpty': 'Нет токенов',
        'admin.webhooks': 'Webhooks',
        'admin.webhooksSubtitle': 'HTTP-уведомления',
        'admin.webhookCreate': 'Создать webhook',
        'admin.webhookName': 'Название',
        'admin.webhookUrl': 'URL',
        'admin.webhookSecret': 'Секрет',
        'admin.webhookEvents': 'События',
        'admin.webhooksEmpty': 'Нет webhook\'ов',
        'admin.apiTokenLastUsed': 'Использован',
        'common.create': 'Создать',
        'common.copy': 'Копировать',
        'common.save': 'Сохранить',
        'common.cancel': 'Отмена',
        'common.success': 'Успех',
        'common.error': 'Ошибка',
        'common.confirmDelete': 'Удалить?',
        'common.disable': 'Отключить',
        'common.enable': 'Включить',
      })[key] || key,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const mockTokens = [
  { id: 1, name: 'CI Token', prefix: 'sd_abc123', scopes: 'tickets:read', expires_at: null, last_used: '2026-09-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' },
]

const mockHooks = [
  { id: 1, name: 'Slack', url: 'https://hooks.slack.com/x', events: 'ticket.created,ticket.closed', is_active: true, last_status: 200, last_error: null, last_triggered_at: '2026-09-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' },
]

describe('ApiTokensSection', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockApi.put.mockReset()
    mockApi.delete.mockReset()
    mockApi.get.mockResolvedValue(mockTokens)
    mockApi.post.mockResolvedValue({ id: 2, name: 'New', prefix: 'sd_xxx', scopes: null, expires_at: null, created_at: null, token: 'sd_rawtoken123' })
    mockApi.delete.mockResolvedValue({})
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('renders token list', async () => {
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText('CI Token')).toBeInTheDocument()
    expect(screen.getByText(/sd_abc123/)).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    mockApi.get.mockResolvedValue([])
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Нет токенов')).toBeInTheDocument()
  })

  it('creates token and shows raw token', async () => {
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    const input = await screen.findByPlaceholderText('Название токена')
    fireEvent.change(input, { target: { value: 'Deploy' } })
    fireEvent.click(screen.getByText('Создать'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api-tokens', { name: 'Deploy' })
    })
    expect(await screen.findByText('sd_rawtoken123')).toBeInTheDocument()
  })

  it('does not create empty token', async () => {
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    await screen.findByText('CI Token')
    fireEvent.click(screen.getByText('Создать'))
    await waitFor(() => {
      expect(mockApi.post).not.toHaveBeenCalled()
    })
  })

  it('creates token via Enter key', async () => {
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    const input = await screen.findByPlaceholderText('Название токена')
    fireEvent.change(input, { target: { value: 'EnterToken' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api-tokens', { name: 'EnterToken' })
    })
  })

  it('deletes token after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    await screen.findByText('CI Token')
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith('/api-tokens/1')
    })
    expect(screen.queryByText('CI Token')).not.toBeInTheDocument()
  })

  it('shows error toast on create failure', async () => {
    mockApi.post.mockRejectedValue(new Error('fail'))
    render(<ApiTokensSection />, { wrapper: makeWrapper() })
    const input = await screen.findByPlaceholderText('Название токена')
    fireEvent.change(input, { target: { value: 'X' } })
    fireEvent.click(screen.getByText('Создать'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })
})

describe('WebhooksSection', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockApi.put.mockReset()
    mockApi.delete.mockReset()
    mockApi.get.mockResolvedValue(mockHooks)
    mockApi.post.mockResolvedValue({ id: 2, name: 'New Hook', url: 'http://x', events: 'ticket.created', is_active: true })
    mockApi.put.mockResolvedValue({})
    mockApi.delete.mockResolvedValue({})
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('renders webhook list with events', async () => {
    render(<WebhooksSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Slack')).toBeInTheDocument()
    expect(screen.getByText('ticket.created, ticket.closed')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    mockApi.get.mockResolvedValue([])
    render(<WebhooksSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText("Нет webhook'ов")).toBeInTheDocument()
  })

  it('opens form, toggles event, creates webhook', async () => {
    render(<WebhooksSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать webhook'))
    const nameInput = await screen.findByPlaceholderText('Slack notifications')
    fireEvent.change(nameInput, { target: { value: 'Teams' } })
    const urlInput = screen.getByPlaceholderText('https://hooks.slack.com/...')
    fireEvent.change(urlInput, { target: { value: 'https://hooks.teams.com/x' } })
    const eventCheckbox = screen.getAllByRole('checkbox')[0]
    expect(eventCheckbox.getAttribute('aria-label') ?? eventCheckbox.closest('label')?.textContent).toBeTruthy()
    fireEvent.click(eventCheckbox)
    fireEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/webhooks', {
        name: 'Teams',
        url: 'https://hooks.teams.com/x',
        secret: '',
        events: ['ticket.created'],
      })
    })
    expect(await screen.findByText('New Hook')).toBeInTheDocument()
  })

  it('does not create without events', async () => {
    render(<WebhooksSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать webhook'))
    const nameInput = await screen.findByPlaceholderText('Slack notifications')
    fireEvent.change(nameInput, { target: { value: 'NoEvents' } })
    const urlInput = screen.getByPlaceholderText('https://hooks.slack.com/...')
    fireEvent.change(urlInput, { target: { value: 'http://x' } })
    fireEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(mockApi.post).not.toHaveBeenCalled()
    })
  })

  it('toggles webhook active state', async () => {
    render(<WebhooksSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Отключить'))
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/webhooks/1', { is_active: false })
    })
  })

  it('deletes webhook after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<WebhooksSection />, { wrapper: makeWrapper() })
    await screen.findByText('Slack')
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith('/webhooks/1')
    })
  })
})