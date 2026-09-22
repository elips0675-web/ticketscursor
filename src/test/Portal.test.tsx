import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PublicPortal from '@/pages/Portal'
import { toast } from 'sonner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'portal.createTicket': 'Создать обращение',
        'portal.createTicketDesc': 'Опишите проблему',
        'portal.name': 'Ваше имя',
        'portal.email': 'Email',
        'portal.subject': 'Тема',
        'portal.description': 'Описание',
        'portal.category': 'Категория',
        'portal.priority': 'Приоритет',
        'portal.submit': 'Отправить',
        'portal.ticketCreated': 'Заявка создана',
        'portal.ticketCreatedTitle': 'Заявка принята',
        'portal.ticketCreatedDesc': 'Спасибо',
        'portal.ticketId': 'Номер заявки',
        'portal.trackingUrl': 'Ссылка для отслеживания',
        'portal.trackingHint': 'Сохраните ссылку',
        'portal.newTicket': 'Новая заявка',
        'portal.trackExisting': 'Отследить заявку',
        'common.loading': 'Загрузка...',
        'common.error': 'Ошибка',
        'common.copied': 'Скопировано',
        'common.copy': 'Копировать',
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

describe('PublicPortal', () => {
  beforeEach(() => {
    mockApi.post.mockReset()
    mockApi.post.mockResolvedValue({ ticketId: 42, trackingUrl: 'http://localhost:5173/portal/track/abc123' })
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('renders the create ticket form', () => {
    render(<PublicPortal />)
    expect(screen.getByText('Создать обращение')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Иван Иванов')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ivan@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Что-то сломалось')).toBeInTheDocument()
  })

  it('submit is disabled until required fields filled', () => {
    render(<PublicPortal />)
    const submitBtn = screen.getByText('Отправить') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByPlaceholderText('ivan@company.com'), { target: { value: 'i@t.ru' } })
    fireEvent.change(screen.getByPlaceholderText('Что-то сломалось'), { target: { value: 'Проблема' } })
    expect(submitBtn.disabled).toBe(false)
  })

  it('submits form and shows success screen with ticket id', async () => {
    render(<PublicPortal />)
    fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByPlaceholderText('ivan@company.com'), { target: { value: 'i@t.ru' } })
    fireEvent.change(screen.getByPlaceholderText('Что-то сломалось'), { target: { value: 'Проблема' } })
    fireEvent.click(screen.getByText('Отправить'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/portal/tickets', expect.objectContaining({ name: 'Иван', email: 'i@t.ru', subject: 'Проблема' }))
    })
    expect(await screen.findByText('Заявка принята')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('shows error toast on submit failure', async () => {
    mockApi.post.mockRejectedValue(new Error('fail'))
    render(<PublicPortal />)
    fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByPlaceholderText('ivan@company.com'), { target: { value: 'i@t.ru' } })
    fireEvent.change(screen.getByPlaceholderText('Что-то сломалось'), { target: { value: 'Проблема' } })
    fireEvent.click(screen.getByText('Отправить'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('returns to form with "Новая заявка" button', async () => {
    render(<PublicPortal />)
    fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByPlaceholderText('ivan@company.com'), { target: { value: 'i@t.ru' } })
    fireEvent.change(screen.getByPlaceholderText('Что-то сломалось'), { target: { value: 'Проблема' } })
    fireEvent.click(screen.getByText('Отправить'))
    fireEvent.click(await screen.findByText('Новая заявка'))
    expect(screen.getByText('Создать обращение')).toBeInTheDocument()
  })

  it('renders tracking link', () => {
    render(<PublicPortal />)
    expect(screen.getByText('Отследить заявку')).toBeInTheDocument()
  })
})