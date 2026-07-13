import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import Calendar from '@/pages/Calendar'

const mockEvents = vi.hoisted(() => [
  {
    id: 1,
    title: 'Team Standup',
    date: '2026-07-06T09:00:00Z',
    time: '09:00',
    description: 'Daily standup',
    category: 'meeting',
    created_by: 1,
    author_name: 'Admin',
  },
  {
    id: 2,
    title: 'Sprint Review',
    date: '2026-07-06T14:00:00Z',
    time: '14:00',
    description: 'Sprint demo',
    category: 'meeting',
    created_by: 1,
    author_name: 'Admin',
  },
  {
    id: 3,
    title: 'Admin Birthday',
    date: '2026-07-15T00:00:00Z',
    time: null,
    description: null,
    category: 'personal',
    created_by: 1,
    author_name: 'Admin',
  },
  {
    id: 4,
    title: 'Project Deadline',
    date: '2026-08-01T00:00:00Z',
    time: null,
    description: 'Final deadline',
    category: 'deadline',
    created_by: 1,
    author_name: 'Admin',
  },
  {
    id: 5,
    title: 'Team Lunch',
    date: '2026-07-06T12:00:00Z',
    time: '12:00',
    description: null,
    category: 'social',
    created_by: 1,
    author_name: 'Admin',
  },
])

const mockApi = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue([]),
  post: vi.fn().mockResolvedValue({}),
  put: vi.fn(),
  delete: vi.fn(),
}))

const mockAuth = vi.hoisted(() => ({
  canManage: false,
  user: { id: 1, name: 'Admin', role: 'admin' },
  token: 'test',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key: string) =>
      ({
        'calendar.title': 'Календарь',
        'calendar.subtitle': 'Планирование событий и встреч',
        'calendar.upcoming': 'Ближайшие',
        'calendar.exportCSV': 'Экспорт CSV',
        'calendar.clickDay': 'Нажмите на день, чтобы увидеть события',
        'calendar.noEvents': 'Нет событий',
        'calendar.eventBtn': 'Добавить событие',
        'calendar.eventTitle': 'Название',
        'calendar.eventTime': 'Время',
        'calendar.eventDesc': 'Описание',
        'calendar.eventPlaceholderTitle': 'Введите название',
        'calendar.createEvent': 'Новое событие',
        'calendar.editEvent': 'Редактировать событие',
        'calendar.submitBtn': 'Создать',
        'calendar.selectDay': 'Выберите день',
        'calendar.allDay': 'Весь день',
        'calendar.at': 'в',
        'common.edit': 'Редактировать',
        'common.delete': 'Удалить',
        'common.cancel': 'Отмена',
        'common.save': 'Сохранить',
        'common.loading': 'Загрузка...',
      })[key] || key
    return { t }
  },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('Calendar page', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.get.mockResolvedValue(mockEvents)
    mockApi.post.mockReset()
    mockApi.post.mockResolvedValue({ id: 99 })
    mockApi.delete.mockReset()
    mockApi.put.mockReset()
    mockApi.put.mockResolvedValue({})
    mockAuth.canManage = false
  })

  it('renders title', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Календарь')).toBeInTheDocument()
  })

  it('shows month navigation', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Предыдущий месяц')).toBeInTheDocument()
    expect(screen.getByLabelText('Следующий месяц')).toBeInTheDocument()
  })

  it('renders day headers', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Пн')).toBeInTheDocument()
    expect(screen.getByText('Вс')).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}))
    render(<Calendar />, { wrapper: makeWrapper() })
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders event titles on calendar', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Team Standup')).toBeInTheDocument()
  })

  it('shows select day prompt initially', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Нажмите на день, чтобы увидеть события')).toBeInTheDocument()
  })

  async function clickDay(dayNum: number) {
    const btn = Array.from(document.querySelectorAll('[role="button"]')).find(
      (el) => el.querySelector('.calendar-date')?.textContent === String(dayNum),
    )
    if (btn) await userEvent.click(btn)
    return btn
  }

  it('shows events when day 6 is clicked', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    const titles = await screen.findAllByText('Team Standup')
    expect(titles.length).toBeGreaterThan(0)
  })

  it('shows no events for day without events', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(3)
    expect(await screen.findByText('Нет событий')).toBeInTheDocument()
  })

  it('shows upcoming events sidebar', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Ближайшие')).toBeInTheDocument()
    await screen.findByText('Team Standup')
  })

  it('shows export CSV button', async () => {
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Экспорт CSV')).toBeInTheDocument()
  })

  it('hides edit/delete when cannot manage', async () => {
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument()
  })

  it('shows edit/delete when can manage', async () => {
    mockAuth.canManage = true
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    const editBtns = screen.getAllByRole('button', { name: 'Редактировать' })
    expect(editBtns.length).toBeGreaterThan(0)
    const delBtns = screen.getAllByRole('button', { name: 'Удалить' })
    expect(delBtns.length).toBeGreaterThan(0)
  })

  it('opens create event dialog', async () => {
    mockAuth.canManage = true
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    await user.click(screen.getByText('Добавить событие'))
    expect(await screen.findByText('Новое событие')).toBeInTheDocument()
  })

  it('creates a new event', async () => {
    mockAuth.canManage = true
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    await user.click(screen.getByText('Добавить событие'))
    await screen.findByText('Новое событие')
    await user.type(screen.getByPlaceholderText('Введите название'), 'New Test Event')
    await user.click(screen.getByText('Создать'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/calendar', expect.objectContaining({ title: 'New Test Event' }))
    })
  })

  it('opens edit event dialog', async () => {
    mockAuth.canManage = true
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Редактировать' })[0])
    expect(await screen.findByText('Редактировать событие')).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Введите название') as HTMLInputElement
    expect(input.value).toBe('Team Standup')
  })

  it('edits an event', async () => {
    mockAuth.canManage = true
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Редактировать' })[0])
    await screen.findByText('Редактировать событие')
    await user.clear(screen.getByPlaceholderText('Введите название'))
    await user.type(screen.getByPlaceholderText('Введите название'), 'Updated Event')
    await user.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/calendar/1', expect.objectContaining({ title: 'Updated Event' }))
    })
  })

  it('deletes an event', async () => {
    mockAuth.canManage = true
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    await screen.findByText('Пн')
    await clickDay(6)
    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Удалить' })[0])
    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith('/calendar/1')
    })
  })

  it('exports CSV', async () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const user = userEvent.setup()
    render(<Calendar />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Экспорт CSV')).toBeInTheDocument()
    await user.click(screen.getByText('Экспорт CSV'))
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalled()
  })
})
