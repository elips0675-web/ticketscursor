import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import { TicketProvider } from '@/context/ticket-context'
import TicketDetail from '@/pages/TicketDetail'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'tickets.notFound': 'Тикет не найден',
        'tickets.backToTickets': 'К списку тикетов',
        'tickets.open': 'Открыт',
        'tickets.inProgress': 'В работе',
        'tickets.resolved': 'Решён',
        'tickets.closed': 'Закрыт',
        'tickets.low': 'Низкий',
        'tickets.medium': 'Средний',
        'tickets.high': 'Высокий',
        'tickets.critical': 'Критичный',
        'tickets.messages': 'Сообщения',
        'tickets.messagePlaceholder': 'Напишите сообщение...',
        'tickets.sendBtn': 'Отправить',
        'tickets.management': 'Управление',
        'tickets.status': 'Статус',
        'tickets.priority': 'Приоритет',
        'tickets.assignedTo': 'Исполнитель',
        'tickets.selectEmployee': 'Выберите сотрудника...',
        'tickets.details': 'Детали',
        'tickets.createdBy': 'Создал',
        'tickets.createdAt': 'Создан {date}',
        'tickets.assignedNotify': 'Назначен',
        'tickets.updatedAt': 'Обновлён',
        'tickets.systemInfo': 'Системная информация',
        'tickets.computerName': 'Имя ПК',
        'tickets.userAccount': 'Учётная запись',
        'tickets.internalNote': 'Внутренняя заметка',
        'tickets.internalBadge': 'Внутр.',
        'tickets.newMessageFrom': 'Новое сообщение от {name}',
        'tickets.tags': 'Теги',
        'tickets.tagsInputPlaceholder': 'добавить теги через запятую',
        'tickets.saveTags': 'Сохранить',
        'common.back': 'Назад',
      })[key] || key,
  }),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}))

function MockSocketProvider({ children }: { children: React.ReactNode }) {
  return (
    <SocketContext.Provider
      value={{
        socket: null,
        connected: false,
        sendMessage: vi.fn(),
        deleteMessage: vi.fn(),
        joinChat: vi.fn(),
        leaveChat: vi.fn(),
        notifyAll: vi.fn(),
        sendTyping: vi.fn(),
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <MockSocketProvider>
            <TicketProvider>
              <MemoryRouter initialEntries={['/tickets/1']}>
                <Routes>
                  <Route path="/tickets/:id" element={children} />
                </Routes>
              </MemoryRouter>
            </TicketProvider>
          </MockSocketProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('TicketDetail', () => {
  it('shows loading state initially', () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders ticket detail after loading', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await waitFor(() => {
      expect(screen.getByText('Проблема с доступом')).toBeInTheDocument()
    })
    expect(screen.getByText('Не могу войти в систему')).toBeInTheDocument()
  })

  it('shows messages section', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByText(/Сообщения/)).toBeInTheDocument()
    expect(screen.getByText('Описание проблемы')).toBeInTheDocument()
  })

  it('shows management section for admins', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByText('Управление')).toBeInTheDocument()
    expect(screen.getByText('Статус')).toBeInTheDocument()
    expect(screen.getByText('Приоритет')).toBeInTheDocument()
  })

  it('shows textarea for new message', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByPlaceholderText('Напишите сообщение...')).toBeInTheDocument()
  })

  it('shows details section', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByText('Детали')).toBeInTheDocument()
    expect(screen.getByText('Создал')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('shows system info for tickets with computerName', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByText('Системная информация')).toBeInTheDocument()
  })

  it('shows back button', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByText('К списку тикетов')).toBeInTheDocument()
  })

  it('shows internal note checkbox', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByText('Внутренняя заметка')).toBeInTheDocument()
  })

  it('typing in message input updates value', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const input = screen.getByPlaceholderText('Напишите сообщение...')
    await user.type(input, 'Тестовое сообщение')
    expect(input).toHaveValue('Тестовое сообщение')
  })

  it('shows existing tags', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getAllByText('vpn').length).toBeGreaterThan(0)
  })

  it('adds new tags via tags input', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const input = screen.getByPlaceholderText('добавить теги через запятую')
    await user.type(input, 'urgent, vpn')
    await user.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(screen.getAllByText('urgent').length).toBeGreaterThan(0)
    })
  })
})
