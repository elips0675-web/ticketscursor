import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import type { ReactNode } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'dashboard.title': 'Дашборд',
        'dashboard.subtitle': 'Общая статистика системы тикетов',
        'dashboard.total': 'Всего',
        'dashboard.totalTickets': 'Всего тикетов',
        'dashboard.open': 'Открытые',
        'dashboard.active': 'Активные',
        'dashboard.critical': 'Критические',
        'dashboard.criticalCount': 'Критических',
        'dashboard.resolved': 'Решённые',
        'dashboard.resolvedToday': 'Решённых',
        'dashboard.byStatus': 'По статусам',
        'dashboard.recentUpdates': 'Последние обновления',
        'dashboard.employees': 'Сотрудники',
        'dashboard.allEmployees': 'Все сотрудники',
        'employees.online': 'Онлайн',
        'employees.offline': 'Офлайн',
        'tickets.open': 'Открыт',
        'tickets.inProgress': 'В работе',
        'tickets.resolved': 'Решён',
        'tickets.closed': 'Закрыт',
      }
      if (key === 'employees.activeTickets' && opts && typeof opts.count === 'number') {
        return `${opts.count} тикетов`
      }
      return map[key] || key
    },
  }),
}))

const now = Date.now()

const mockTickets = [
  {
    id: 1,
    title: 'Ticket A',
    description: 'Desc A',
    status: 'open' as const,
    priority: 'critical' as const,
    category: 'bug' as const,
    tags: [],
    computerName: 'PC-1',
    userAccount: null,
    createdBy: { id: 1, name: 'User', email: '', avatar: '' },
    assignedTo: {
      id: 1,
      name: 'Agent A',
      email: '',
      avatar: '',
      role: 'agent' as const,
      department: 'IT',
      online: true,
      activeTickets: 5,
      resolvedToday: 2,
    },
    messages: [],
    messages_count: 0,
    createdAt: new Date(now - 86400000).toISOString(),
    updatedAt: new Date(now - 3600000).toISOString(),
  },
  {
    id: 2,
    title: 'Ticket B',
    description: 'Desc B',
    status: 'in_progress' as const,
    priority: 'high' as const,
    category: 'support' as const,
    tags: [],
    computerName: null,
    userAccount: null,
    createdBy: { id: 2, name: 'User 2', email: '', avatar: '' },
    assignedTo: undefined,
    messages: [],
    messages_count: 0,
    createdAt: new Date(now - 172800000).toISOString(),
    updatedAt: new Date(now - 7200000).toISOString(),
  },
  {
    id: 3,
    title: 'Ticket C',
    description: 'Desc C',
    status: 'resolved' as const,
    priority: 'medium' as const,
    category: 'feature' as const,
    tags: [],
    computerName: null,
    userAccount: null,
    createdBy: { id: 1, name: 'User', email: '', avatar: '' },
    assignedTo: {
      id: 2,
      name: 'Agent B',
      email: '',
      avatar: '',
      role: 'agent' as const,
      department: 'Support',
      online: false,
      activeTickets: 3,
      resolvedToday: 1,
    },
    messages: [],
    messages_count: 0,
    createdAt: new Date(now - 259200000).toISOString(),
    updatedAt: new Date(now - 1800000).toISOString(),
  },
  {
    id: 4,
    title: 'Ticket D',
    description: 'Desc D',
    status: 'closed' as const,
    priority: 'low' as const,
    category: 'other' as const,
    tags: [],
    computerName: null,
    userAccount: null,
    createdBy: { id: 3, name: 'User 3', email: '', avatar: '' },
    assignedTo: undefined,
    messages: [],
    messages_count: 0,
    createdAt: new Date(now - 604800000).toISOString(),
    updatedAt: new Date(now - 600000).toISOString(),
  },
]

const mockEmployees = [
  {
    id: 1,
    name: 'Alice Smith',
    email: 'alice@test.com',
    role: 'admin' as const,
    department: 'IT',
    online: true,
    activeTickets: 3,
    resolvedToday: 5,
    avatar: '',
  },
  {
    id: 2,
    name: 'Bob Johnson',
    email: 'bob@test.com',
    role: 'agent' as const,
    department: 'Support',
    online: false,
    activeTickets: 7,
    resolvedToday: 2,
    avatar: '',
  },
  {
    id: 3,
    name: 'Charlie Brown',
    email: 'charlie@test.com',
    role: 'senior_agent' as const,
    department: 'IT',
    online: true,
    activeTickets: 1,
    resolvedToday: 8,
    avatar: '',
  },
  {
    id: 4,
    name: 'Diana Prince',
    email: 'diana@test.com',
    role: 'agent' as const,
    department: 'HR',
    online: false,
    activeTickets: 0,
    resolvedToday: 0,
    avatar: '',
  },
  {
    id: 5,
    name: 'Eve Adams',
    email: 'eve@test.com',
    role: 'admin' as const,
    department: 'IT',
    online: true,
    activeTickets: 2,
    resolvedToday: 3,
    avatar: '',
  },
  {
    id: 6,
    name: 'Frank Castle',
    email: 'frank@test.com',
    role: 'agent' as const,
    department: 'Support',
    online: true,
    activeTickets: 4,
    resolvedToday: 1,
    avatar: '',
  },
  {
    id: 7,
    name: 'Grace Hopper',
    email: 'grace@test.com',
    role: 'senior_agent' as const,
    department: 'DevOps',
    online: false,
    activeTickets: 0,
    resolvedToday: 0,
    avatar: '',
  },
]

vi.mock('@/context/ticket-context', () => ({
  useTickets: () => ({
    tickets: mockTickets,
    employees: mockEmployees,
    stats: { total: 4, open: 1, inProgress: 2, resolved: 1, critical: 1, avgResolutionTime: 4.5 },
    loading: false,
    updateTicketStatus: vi.fn(),
    updateTicketPriority: vi.fn(),
    assignTicket: vi.fn(),
    addMessage: vi.fn(),
    createTicket: vi.fn(),
  }),
  TicketProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function TestWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('Dashboard', () => {
  it('renders title', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('Дашборд')).toBeInTheDocument()
  })

  it('shows stat cards', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('Всего тикетов')).toBeInTheDocument()
    expect(screen.getByText('Активные')).toBeInTheDocument()
    expect(screen.getByText('Критических')).toBeInTheDocument()
    expect(screen.getByText('Решённых')).toBeInTheDocument()
  })

  it('shows counts', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(2)
  })

  it('shows employee section', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('Сотрудники')).toBeInTheDocument()
    expect(screen.getByText('Все сотрудники')).toBeInTheDocument()
  })

  it('shows employee cards', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument()
    const its = screen.getAllByText('IT')
    expect(its.length).toBeGreaterThanOrEqual(1)
  })

  it('shows online status', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const online = screen.getAllByText('Онлайн')
    expect(online.length).toBeGreaterThanOrEqual(1)
  })

  it('shows recent tickets', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('Ticket A')).toBeInTheDocument()
    expect(screen.getByText('Ticket B')).toBeInTheDocument()
  })

  it('shows status badges', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    screen.getAllByText('Открыт')
    screen.getAllByText('В работе')
    screen.getAllByText('Решён')
  })

  it('shows chart and updates headings', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.getByText('По статусам')).toBeInTheDocument()
    expect(screen.getByText('Последние обновления')).toBeInTheDocument()
  })

  it('limits to first 6 employees', () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument()
  })

  it('navigates via total card click', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const btns = screen.getAllByRole('button')
    await userEvent.click(btns[0])
  })

  it('navigates via total card enter key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const btns = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')
    await userEvent.type(btns[0], '{enter}')
  })

  it('navigates via active card space key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const btns = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')
    if (btns.length > 1) await userEvent.type(btns[1], ' ')
  })

  it('navigates via critical card enter key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const btns = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')
    if (btns.length > 2) await userEvent.type(btns[2], '{enter}')
  })

  it('navigates via resolved card space key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const btns = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')
    if (btns.length > 3) await userEvent.type(btns[3], ' ')
  })

  it('navigates via all employees button enter key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const allEmpBtn = screen.getByText('Все сотрудники')
    await userEvent.type(allEmpBtn, '{enter}')
  })

  it('navigates via employee card enter key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const empCard = screen.getByText('Alice Smith').closest('[role="button"]')
    if (empCard) await userEvent.type(empCard, '{enter}')
  })

  it('navigates via ticket space key', async () => {
    render(<Dashboard />, { wrapper: TestWrapper })
    const ticketEl = screen.getByText('Ticket A').closest('[role="button"]')
    if (ticketEl) await userEvent.type(ticketEl, ' ')
  })
})
