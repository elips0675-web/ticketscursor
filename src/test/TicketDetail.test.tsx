import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import { TicketProvider } from '@/context/ticket-context'
import { server } from './setup'
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
        'tickets.timeCard': 'Время',
        'tickets.timeTotal': 'Всего затрачено: {time}',
        'tickets.timeMinutes': 'Минуты',
        'tickets.timeDescription': 'Описание',
        'tickets.timeAdd': 'Добавить время',
        'tickets.timeAddButton': 'Добавить',
        'tickets.timeStart': 'Старт',
        'tickets.timeStop': 'Стоп',
        'tickets.timeEmpty': 'Записей нет',
        'tickets.timeEntryMinutes': '{minutes} мин',
        'tickets.assistant': 'Ассистент (Wiki)',
        'tickets.assistantAsk': 'Спросить ассистента',
        'tickets.assistantLoading': 'Ассистент думает...',
        'tickets.assistantAnswer': 'Рекомендация',
        'tickets.assistantSources': 'Источники',
        'tickets.assistantInsert': 'Вставить в сообщение',
        'tickets.assistantError': 'Не удалось получить ответ ассистента',
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

  it('shows mention autocomplete when typing @', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const input = screen.getByPlaceholderText('Напишите сообщение...')
    await user.type(input, 'Посмотри @Пёт')
    await waitFor(() => {
      expect(screen.getByTestId('mention-menu')).toBeInTheDocument()
    })
    expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
  })

  it('inserts full name when selecting a mention', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const input = screen.getByPlaceholderText('Напишите сообщение...')
    await user.type(input, 'Спроси @Пёт')
    await waitFor(() => {
      expect(screen.getByTestId('mention-menu')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Пётр Петров'))
    expect(input).toHaveValue('Спроси @Пётр Петров')
    await waitFor(() => {
      expect(screen.queryByTestId('mention-menu')).not.toBeInTheDocument()
    })
  })

  it('hides mention menu when typing no match', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const input = screen.getByPlaceholderText('Напишите сообщение...')
    await user.type(input, 'Привет @Zzz')
    expect(screen.queryByTestId('mention-menu')).not.toBeInTheDocument()
  })

  it('renders existing mentions as highlighted spans', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await waitFor(() => {
      expect(screen.getAllByTestId('message-mention').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows assistant card for staff roles', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.getByTestId('assistant-card')).toBeInTheDocument()
    expect(screen.getByText('Спросить ассистента')).toBeInTheDocument()
  })

  it('asks assistant and shows suggestion with sources', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    await user.click(screen.getByTestId('assistant-ask'))
    await waitFor(() => {
      expect(screen.getByTestId('assistant-answer')).toBeInTheDocument()
    })
    expect(screen.getByText(/VPN-клиенту/)).toBeInTheDocument()
    expect(screen.getByText('Источники')).toBeInTheDocument()
    expect(screen.getByText('Как настроить VPN')).toBeInTheDocument()
  })

  it('inserts assistant suggestion into message input', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    await user.click(screen.getByTestId('assistant-ask'))
    await waitFor(() => {
      expect(screen.getByTestId('assistant-answer')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('assistant-insert'))
    const textarea = screen.getByPlaceholderText('Напишите сообщение...')
    expect(textarea).toHaveValue(
      'Проверьте подключение к VPN-клиенту и перезапустите его. Инструкция доступна в базе знаний.',
    )
  })

  it('hides assistant card for requester role', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 3, name: 'Резидент', email: 'r@test.com', role: 'requester' }))
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.queryByTestId('assistant-card')).not.toBeInTheDocument()
  })
})

describe('TicketDetail time tracking', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  })

  it('shows time card with total and entries', async () => {
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    await waitFor(() => {
      expect(screen.getByTestId('time-card')).toBeInTheDocument()
    })
    expect(screen.getByText(/Всего затрачено/)).toBeInTheDocument()
    expect(screen.getByText('Диагностика')).toBeInTheDocument()
    expect(screen.getAllByTestId('time-entry').length).toBeGreaterThan(0)
  })

  it('adds a time entry via form', async () => {
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const minutesInput = await screen.findByTestId('time-minutes')
    await user.type(minutesInput, '30')
    await user.click(screen.getByTestId('time-add-button'))
    await waitFor(() => {
      expect(screen.getByTestId('time-add-button')).toBeDisabled()
    })
  })

  it('starts and stops a timer', async () => {
    const API = 'http://localhost:4000/api'
    let activeTimer: { id: number; ticket_id: number; user_id: number; started_at: string } | null = null
    server.use(
      http.get(`${API}/tickets/:id/time`, () =>
        HttpResponse.json({
          success: true,
          data: { entries: [], totalMinutes: 0, totalEntries: 0, activeTimer },
        }),
      ),
      http.post(`${API}/tickets/:id/time/timer/start`, () => {
        activeTimer = { id: 1, ticket_id: 1, user_id: 1, started_at: new Date().toISOString() }
        return HttpResponse.json({ success: true, data: activeTimer }, { status: 201 })
      }),
      http.post(`${API}/tickets/:id/time/timer/stop`, () => {
        activeTimer = null
        return HttpResponse.json({ success: true, data: { timer: null, minutes: 1, entry: { id: 99 } } })
      }),
    )
    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const start = await screen.findByTestId('time-start-timer')
    await user.click(start)
    await waitFor(() => {
      expect(screen.getByTestId('time-stop-timer')).toBeInTheDocument()
    })
    expect(screen.getByTestId('time-timer')).toBeInTheDocument()
    await user.click(screen.getByTestId('time-stop-timer'))
    await waitFor(() => {
      expect(screen.getByTestId('time-start-timer')).toBeInTheDocument()
    })
  })

  it('hides time card for requester role', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 3, name: 'Резидент', email: 'r@test.com', role: 'requester' }))
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    expect(screen.queryByTestId('time-card')).not.toBeInTheDocument()
  })
})
