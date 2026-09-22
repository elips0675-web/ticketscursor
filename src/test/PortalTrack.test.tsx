import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PortalTrack from '@/pages/PortalTrack'
import { toast } from 'sonner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'portal.trackTitle': 'Отслеживание заявки',
        'portal.trackSubtitle': 'Введите код',
        'portal.trackPlaceholder': 'Код доступа',
        'portal.trackBtn': 'Найти',
        'portal.trackError': 'Заявка не найдена',
        'portal.requester': 'Заявитель',
        'portal.priority': 'Приоритет',
        'portal.messages': 'Сообщения',
        'portal.reply': 'Ответ',
        'portal.replyPlaceholder': 'Ваш ответ...',
        'portal.sendReply': 'Отправить',
        'portal.replySent': 'Ответ отправлен',
        'common.error': 'Ошибка',
      })[key] || key,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

const mockTicket = {
  id: 42,
  title: 'Не работает принтер',
  description: 'Офис 301',
  status: 'open',
  priority: 'high',
  category: 'bug',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  requester: 'Иван Иванов',
  messages: [
    { id: 1, sender: 'Support', text: 'Здравствуйте!', created_at: '2026-09-01T11:00:00Z', attachments: [] },
  ],
}

describe('PortalTrack', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockApi.get.mockResolvedValue(mockTicket)
    mockApi.post.mockResolvedValue({ id: 2, text: 'Спасибо!', created_at: '2026-09-02T10:00:00Z' })
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('renders track form', () => {
    render(<PortalTrack />)
    expect(screen.getByText('Отслеживание заявки')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Код доступа')).toBeInTheDocument()
  })

  it('search button disabled without token', () => {
    render(<PortalTrack />)
    const btn = screen.getByText('Найти') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('fetches ticket by token via button', async () => {
    render(<PortalTrack />)
    fireEvent.change(screen.getByPlaceholderText('Код доступа'), { target: { value: 'tok123' } })
    fireEvent.click(screen.getByText('Найти'))
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/portal/track/tok123')
    })
    expect(await screen.findByText('#42 — Не работает принтер')).toBeInTheDocument()
    expect(screen.getByText('Здравствуйте!')).toBeInTheDocument()
  })

  it('fetches ticket via Enter key', async () => {
    render(<PortalTrack />)
    const input = screen.getByPlaceholderText('Код доступа')
    fireEvent.change(input, { target: { value: 'tok456' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/portal/track/tok456')
    })
  })

  it('shows error message when ticket not found', async () => {
    mockApi.get.mockRejectedValue(new Error('Заявка не найдена'))
    render(<PortalTrack />)
    fireEvent.change(screen.getByPlaceholderText('Код доступа'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('Найти'))
    expect(await screen.findByText('Заявка не найдена')).toBeInTheDocument()
  })

  it('sends reply and appends message', async () => {
    render(<PortalTrack />)
    fireEvent.change(screen.getByPlaceholderText('Код доступа'), { target: { value: 'tok123' } })
    fireEvent.click(screen.getByText('Найти'))
    await screen.findByText('#42 — Не работает принтер')
    const textarea = screen.getByPlaceholderText('Ваш ответ...')
    fireEvent.change(textarea, { target: { value: 'Спасибо!' } })
    fireEvent.click(screen.getByText('Отправить'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/portal/track/tok123/reply', { text: 'Спасибо!' })
    })
    expect(await screen.findByText('Спасибо!')).toBeInTheDocument()
  })

  it('shows error toast on reply failure', async () => {
    mockApi.post.mockRejectedValue(new Error('fail'))
    render(<PortalTrack />)
    fireEvent.change(screen.getByPlaceholderText('Код доступа'), { target: { value: 'tok123' } })
    fireEvent.click(screen.getByText('Найти'))
    await screen.findByText('#42 — Не работает принтер')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ...'), { target: { value: 'X' } })
    fireEvent.click(screen.getByText('Отправить'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })
})