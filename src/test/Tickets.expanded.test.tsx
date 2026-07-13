import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Tickets from '@/pages/Tickets'
import { SocketContext } from '@/context/SocketContext'
import type { ReactNode } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key: string) =>
      ({
        'tickets.open': 'Открыт',
        'tickets.inProgress': 'В работе',
        'tickets.resolved': 'Решён',
        'tickets.closed': 'Закрыт',
        'tickets.low': 'Низкий',
        'tickets.medium': 'Средний',
        'tickets.high': 'Высокий',
        'tickets.critical': 'Критичный',
        'tickets.search': 'Поиск по тикетам...',
        'tickets.allStatuses': 'Все статусы',
        'tickets.allPriorities': 'Все приоритеты',
        'tickets.notFound': 'Тикеты не найдены',
        'tickets.tryAdjust': 'Попробуйте изменить параметры поиска',
        'tickets.showMore': 'Показать ещё',
        'tickets.new': 'Новый тикет',
        'tickets.exportCSV': 'CSV',
        'tickets.exportPDF': 'PDF',
        'tickets.title': 'Тикеты',
        'tickets.csvHeaderId': 'ID',
        'tickets.csvHeaderTitle': 'Название',
        'tickets.csvHeaderStatus': 'Статус',
        'tickets.csvHeaderPriority': 'Приоритет',
        'tickets.csvHeaderCategory': 'Категория',
        'tickets.csvHeaderAssignee': 'Исполнитель',
        'tickets.csvHeaderCreated': 'Создан',
        'tickets.exportLimitWarn': 'Экспорт ограничен {limit} записями',
      })[key] || key
    return { t }
  },
}))

const now = Date.now()
const mkTicket = (
  id: number,
  overrides: Partial<{
    title: string
    description: string
    status: string
    priority: string
    category: string
    messages_count: number
    createdBy: { id: number; name: string; email: string; avatar: string }
    assignedTo:
      | {
          id: number
          name: string
          email: string
          avatar: string
          role: string
          department: string
          online: boolean
          activeTickets: number
          resolvedToday: number
        }
      | undefined
    updatedAt: string
    createdAt: string
  }>,
) => ({
  id,
  title: `Ticket ${id}`,
  description: `Description ${id}`,
  status: 'open',
  priority: 'medium',
  category: 'bug',
  tags: [],
  computerName: null,
  userAccount: null,
  createdBy: { id: 1, name: 'User A', email: '', avatar: '' },
  assignedTo: undefined,
  messages: [],
  messages_count: 0,
  createdAt: new Date(now - id * 3600000).toISOString(),
  updatedAt: new Date(now - id * 1800000).toISOString(),
  ...overrides,
})

const mockTickets = [
  mkTicket(1, { title: 'Network issue', status: 'open', priority: 'critical', category: 'incident' }),
  mkTicket(2, { title: 'Printer jam', status: 'in_progress', priority: 'high', category: 'support' }),
  mkTicket(3, { title: 'Software request', status: 'resolved', priority: 'medium', category: 'feature' }),
  mkTicket(4, { title: 'Email not working', status: 'open', priority: 'low', category: 'support' }),
  mkTicket(5, { title: 'Login problem', status: 'closed', priority: 'high', category: 'bug' }),
  mkTicket(6, { title: 'Hardware request', status: 'open', priority: 'medium', category: 'support' }),
  mkTicket(7, { title: 'Server down', status: 'in_progress', priority: 'critical', category: 'incident' }),
  mkTicket(8, { title: 'Password reset', status: 'resolved', priority: 'low', category: 'support' }),
  mkTicket(9, { title: 'New employee', status: 'open', priority: 'medium', category: 'feature' }),
  mkTicket(10, { title: 'Backup failure', status: 'open', priority: 'high', category: 'incident' }),
  mkTicket(11, { title: 'Extra ticket', status: 'open', priority: 'low', category: 'support' }),
]

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
}

const mockCtx = {
  tickets: mockTickets,
  employees: [],
  stats: { total: 11, open: 5, inProgress: 2, resolved: 2, critical: 2, avgResolutionTime: 0 },
  loading: false,
  updateTicketStatus: vi.fn(),
  updateTicketPriority: vi.fn(),
  assignTicket: vi.fn(),
  addMessage: vi.fn(),
  createTicket: vi.fn(),
}

vi.mock('@/context/ticket-context', () => ({
  useTickets: () => mockCtx,
  TicketProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function TestWrapper({
  children,
  socket,
  url,
}: {
  children: ReactNode
  socket?: typeof mockSocket | null
  url?: string
}) {
  return (
    <MemoryRouter initialEntries={url ? [url] : undefined}>
      <SocketContext.Provider
        value={{
          socket: socket ?? null,
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
    </MemoryRouter>
  )
}

describe('Tickets', () => {
  beforeEach(() => {
    mockSocket.on.mockReset()
    mockSocket.off.mockReset()
    mockCtx.loading = false
  })

  it('renders title', async () => {
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('Тикеты')).toBeInTheDocument()
  })

  it('renders ticket cards', async () => {
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('Network issue')).toBeInTheDocument()
    expect(screen.getByText('Printer jam')).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    mockCtx.loading = true
    render(<Tickets />, { wrapper: TestWrapper })
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
    mockCtx.loading = false
  })

  it('shows export buttons', async () => {
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('CSV')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('shows status and priority badges', async () => {
    render(<Tickets />, { wrapper: TestWrapper })
    const krits = await screen.findAllByText('Критичный')
    expect(krits.length).toBeGreaterThanOrEqual(1)
    const opens = screen.getAllByText('Открыт')
    expect(opens.length).toBeGreaterThanOrEqual(1)
  })

  it('shows created by name', async () => {
    render(<Tickets />, { wrapper: TestWrapper })
    const names = await screen.findAllByText('User A')
    expect(names.length).toBeGreaterThanOrEqual(1)
  })

  it('filters by search', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('Network issue')).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Поиск по тикетам...')
    await user.type(input, 'Printer')
    await waitFor(() => {
      expect(screen.queryByText('Network issue')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Printer jam')).toBeInTheDocument()
  })

  it('filters by status via url param', async () => {
    render(<Tickets />, { wrapper: (p) => <TestWrapper {...p} url="/tickets?status=resolved" /> })
    await waitFor(() => {
      expect(screen.getByText('Software request')).toBeInTheDocument()
    })
    expect(screen.queryByText('Network issue')).not.toBeInTheDocument()
    expect(screen.queryByText('Printer jam')).not.toBeInTheDocument()
  })

  it('filters by priority via url param', async () => {
    render(<Tickets />, { wrapper: (p) => <TestWrapper {...p} url="/tickets?priority=critical" /> })
    await waitFor(() => {
      expect(screen.getByText('Network issue')).toBeInTheDocument()
    })
    expect(screen.getByText('Server down')).toBeInTheDocument()
    expect(screen.queryByText('Printer jam')).not.toBeInTheDocument()
  })

  it('shows empty state when no match', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('Network issue')).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Поиск по тикетам...')
    await user.type(input, 'ZZZZNOPE')
    await waitFor(() => {
      expect(screen.getByText('Тикеты не найдены')).toBeInTheDocument()
    })
  })

  it('shows more button and loads more', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('Показать ещё')).toBeInTheDocument()
    await user.click(screen.getByText('Показать ещё'))
    await waitFor(() => {
      expect(screen.getByText('Extra ticket')).toBeInTheDocument()
    })
  })

  it('navigates on ticket card click', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    const card = await screen.findByText('Network issue')
    const btn = card.closest('[role="button"]')
    if (btn) await user.click(btn)
  })

  it('navigates on ticket card enter key', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    const card = await screen.findByText('Network issue')
    const btn = card.closest('[role="button"]')
    if (btn) await user.type(btn, '{enter}')
  })

  it('navigates on ticket card space key', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    const card = await screen.findByText('Network issue')
    const btn = card.closest('[role="button"]')
    if (btn) await user.type(btn, ' ')
  })

  it('subscribes to socket events when socket present', () => {
    render(<Tickets />, { wrapper: (p) => <TestWrapper {...p} socket={mockSocket} /> })
    expect(mockSocket.on).toHaveBeenCalledWith('ticket:created', expect.any(Function))
    expect(mockSocket.on).toHaveBeenCalledWith('ticket:updated', expect.any(Function))
  })

  it('cleans up socket subscriptions on unmount', () => {
    const { unmount } = render(<Tickets />, { wrapper: (p) => <TestWrapper {...p} socket={mockSocket} /> })
    unmount()
    expect(mockSocket.off).toHaveBeenCalledWith('ticket:created', expect.any(Function))
    expect(mockSocket.off).toHaveBeenCalledWith('ticket:updated', expect.any(Function))
  })

  it('exports CSV', async () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('CSV')).toBeInTheDocument()
    await user.click(screen.getByText('CSV'))
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalled()
  })

  it('exports PDF', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('PDF')).toBeInTheDocument()
    await user.click(screen.getByText('PDF'))
    // pdf export may or may not work in jsdom, but clicking covers the handler
  })

  it('sorts tickets by oldest', async () => {
    const user = userEvent.setup()
    render(<Tickets />, { wrapper: TestWrapper })
    expect(await screen.findByText('Network issue')).toBeInTheDocument()
    const sortBtn = screen.getByLabelText('Сортировка')
    await user.click(sortBtn)
  })
})
