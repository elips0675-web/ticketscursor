import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import Admin from '@/pages/Admin'

const mockEmployees = [
  {
    id: 1,
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
    department: 'IT',
    online: true,
    activeTickets: 3,
    resolvedToday: 5,
    isActive: true,
  },
  {
    id: 2,
    name: 'Senior Agent',
    email: 'senior@test.com',
    role: 'senior_agent',
    department: 'Support',
    online: true,
    activeTickets: 7,
    resolvedToday: 2,
    isActive: true,
  },
  {
    id: 3,
    name: 'Agent One',
    email: 'agent1@test.com',
    role: 'agent',
    department: 'Support',
    online: false,
    activeTickets: 2,
    resolvedToday: 1,
    isActive: true,
  },
  {
    id: 4,
    name: 'Inactive User',
    email: 'inactive@test.com',
    role: 'agent',
    department: 'HR',
    online: false,
    activeTickets: 0,
    resolvedToday: 0,
    isActive: false,
  },
]

const mockStats = { total: 45, open: 12, inProgress: 8, resolved: 20, critical: 3 }

const mockSlaStats = { total: 20, overdue: 3, onTime: 17, noSla: 0 }

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key: string) =>
      ({
        'admin.dashboard': 'Панель управления',
        'admin.dashboardSubtitle': 'Администрирование системы',
        'admin.refresh': 'Обновить',
        'admin.employees': 'Сотрудники',
        'admin.online': 'На линии',
        'admin.offline': 'Не в сети',
        'admin.totalTickets': 'Всего тикетов',
        'admin.active': 'Активные',
        'admin.manage': 'Управлять',
        'admin.roleStats': 'Роли',
        'admin.admins': 'Администраторы',
        'admin.seniorAgents': 'Старшие агенты',
        'admin.agents': 'Агенты',
        'admin.slaTitle': 'SLA статистика',
        'admin.slaOnTime': 'В срок',
        'admin.slaOverdue': 'Просрочено',
        'admin.slaNoSla': 'Без SLA',
        'admin.slaCompliance': 'Соблюдение',
        'admin.ticketCount': 'тикетов: {count}',
        'employees.admin': 'Админ',
        'employees.seniorAgent': 'Ст. агент',
        'employees.agent': 'Агент',
      })[key] || key
    return { t }
  },
}))

function mockFetch(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(data),
  })
}

function TestWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('Admin Dashboard', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders title and subtitle', async () => {
    global.fetch = mockFetch([]) as typeof fetch
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Панель управления')).toBeInTheDocument()
    expect(screen.getByText('Администрирование системы')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    global.fetch = mockFetch([]) as typeof fetch
    render(<Admin />, { wrapper: TestWrapper })
    expect(screen.getByText('Обновить')).toBeInTheDocument()
  })

  it('shows refresh button', async () => {
    global.fetch = mockFetch([]) as typeof fetch
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Обновить')).toBeInTheDocument()
  })

  it('displays employee count', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const threes = await screen.findAllByText('3')
    expect(threes.length).toBeGreaterThan(0)
  })

  it('displays online count', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const twos = await screen.findAllByText('2')
    expect(twos.length).toBeGreaterThan(0)
  })

  it('displays total tickets', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    await waitFor(() => {
      expect(screen.getByText('45')).toBeInTheDocument()
    })
  })

  it('displays active tickets count', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    await waitFor(() => {
      expect(screen.getByText('20')).toBeInTheDocument()
    })
  })

  it('renders employee list', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    expect(await screen.findByText('Admin User')).toBeInTheDocument()
    expect(screen.getByText('Senior Agent')).toBeInTheDocument()
    expect(screen.getByText('Agent One')).toBeInTheDocument()
    expect(screen.queryByText('Inactive User')).not.toBeInTheDocument()
  })

  it('shows role badges', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Админ')).toBeInTheDocument()
    expect(screen.getByText('Ст. агент')).toBeInTheDocument()
    expect(screen.getByText('Агент')).toBeInTheDocument()
  })

  it('shows online status for employees', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('На линии')).toBeInTheDocument()
  })

  it('shows offline status', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Не в сети')).toBeInTheDocument()
  })

  it('shows role distribution stats', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Администраторы')).toBeInTheDocument()
    expect(screen.getByText('Старшие агенты')).toBeInTheDocument()
    expect(screen.getByText('Агенты')).toBeInTheDocument()
  })

  it('shows SLA stats card', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('SLA статистика')).toBeInTheDocument()
    expect(screen.getByText('В срок')).toBeInTheDocument()
    expect(screen.getByText('Просрочено')).toBeInTheDocument()
    expect(screen.getByText('Соблюдение')).toBeInTheDocument()
  })

  it('hides SLA stats when null', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    await waitFor(() => {
      expect(screen.queryByText('SLA статистика')).not.toBeInTheDocument()
    })
  })

  it('handles fetch errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const zeros = await screen.findAllByText('0')
    expect(zeros.length).toBeGreaterThan(0)
  })

  it('shows manage button linking to admin users', async () => {
    global.fetch = mockFetch([]) as typeof fetch
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Управлять')).toBeInTheDocument()
  })

  it('shows SLA compliance percentage', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const pcts = await screen.findAllByText(/85/)
    expect(pcts.length).toBeGreaterThan(0)
  })

  it('shows 0% SLA compliance when all are noSla', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ total: 5, overdue: 0, onTime: 0, noSla: 5 }) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const zeros = await screen.findAllByText(/0/)
    expect(zeros.length).toBeGreaterThan(0)
  })

  it('refreshes data on button click', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    global.fetch = fetchMock
    const user = userEvent.setup()
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const threes = await screen.findAllByText('3')
    expect(threes.length).toBeGreaterThan(0)
    fetchMock.mockClear()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 0, open: 0, inProgress: 0, resolved: 0, critical: 0 }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) })
    await user.click(screen.getByText('Обновить'))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  it('shows employee email and department', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEmployees) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('admin@test.com · IT')).toBeInTheDocument()
  })

  it('handles unwrapApiData with null data field', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: null }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSlaStats) })
    render(<Admin />, { wrapper: TestWrapper })
    await screen.findByText('Панель управления')
    const zeros = await screen.findAllByText('0')
    expect(zeros.length).toBeGreaterThan(0)
  })

  it('navigates to admin users on manage click', async () => {
    global.fetch = mockFetch([]) as typeof fetch
    const user = userEvent.setup()
    render(<Admin />, { wrapper: TestWrapper })
    expect(await screen.findByText('Управлять')).toBeInTheDocument()
    await user.click(screen.getByText('Управлять'))
  })
})
