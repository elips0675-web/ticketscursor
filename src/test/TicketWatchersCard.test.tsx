import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import { toast } from 'sonner'
import TicketWatchersCard from '@/components/TicketWatchersCard'

let flagOn = true

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => flagOn }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.loading': 'Загрузка...',
        'tickets.watchers': 'Подписчики',
        'tickets.watchersEmpty': 'Нет подписчиков',
        'tickets.watchersHint': 'Подписчики получают уведомления об изменениях тикета',
        'tickets.watcherSubscribe': 'Подписаться',
        'tickets.watcherUnsubscribe': 'Отписаться',
        'tickets.watcherAdded': 'Подписка оформлена',
        'tickets.watcherRemoved': 'Подписка отменена',
        'tickets.watcherError': 'Не удалось обновить подписку',
        'tickets.watcherInvalidId': 'Введите корректный id сотрудника',
        'tickets.watcherEmployeeId': 'ID сотрудника',
        'tickets.watcherAdd': 'Добавить',
        'tickets.watcherRemove': 'Отписать',
      })[key] || key,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const WATCHERS = [
  { id: 2, name: 'Иван Иванов', email: 'ivan@example.com', avatar: '', created_at: '2026-07-01T10:00:00Z' },
  { id: 3, name: 'Пётр Петров', email: 'petr@example.com', avatar: '', created_at: '2026-07-01T11:00:00Z' },
]

function mockApi(overrides: { failList?: boolean; watchers?: unknown[] } = {}) {
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    if (overrides.failList && path.includes('/watchers') && (init?.method || 'GET') === 'GET') {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      })
    }
    if (path.includes('/watchers')) {
      const method = init?.method || 'GET'
      if (method === 'GET') {
        const list = overrides.watchers ?? WATCHERS
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: list }) })
      }
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ success: true, data: { id: 1, name: 'Admin', email: 'a@b.c', avatar: '' } }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { removed: true } }) })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'not found' }) })
  }) as unknown as typeof fetch
}

async function renderCard() {
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  localStorage.setItem('token', 'token-123')
  const user = userEvent.setup()
  render(<TicketWatchersCard ticketId={1} />, { wrapper: AllTheProviders })
  return user
}

beforeEach(() => {
  localStorage.clear()
  flagOn = true
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  mockApi()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
  vi.clearAllMocks()
})

describe('TicketWatchersCard (Этап 64, подфича 1)', () => {
  it('рендерит список подписчиков с именами и email', async () => {
    await renderCard()
    await screen.findByText('Иван Иванов')
    expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
    // Заголовок со счётчиком: «Подписчики (2)» (точное совпадение — хинт содержит «Подписчики получают…»)
    expect(screen.getByText('Подписчики')).toBeInTheDocument()
  })

  it('подписка: клик «Подписаться» → POST /watchers с employeeId текущего пользователя', async () => {
    mockApi({ watchers: [] })
    const user = await renderCard()
    await screen.findByText('Нет подписчиков')
    await user.click(screen.getByTestId('watcher-toggle-self'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/1/watchers'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Подписка оформлена')
    })
  })

  it('отписка: клик «Отписаться» → DELETE /watchers/:id', async () => {
    mockApi({ watchers: [{ id: 1, name: 'Admin', email: 'admin@test.com', avatar: '', created_at: '' }] })
    const user = await renderCard()
    await screen.findByText('Admin')
    // Текущий пользователь (id 1) в списке — кнопка «Отписаться»
    await user.click(screen.getByTestId('watcher-toggle-self'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/1/watchers/1'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('добавление watcher по ID (поле + кнопка «Добавить») у admin/senior_agent', async () => {
    const user = await renderCard()
    await screen.findByText('Иван Иванов')
    await user.type(screen.getByTestId('watcher-employee-id'), '5')
    await user.click(screen.getByTestId('watcher-add'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => String(c[0]).includes('/watchers') && c[1]?.method === 'POST')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall[1].body)).toEqual({ employeeId: 5 })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Подписка оформлена')
    })
  })

  it('невалидный ID сотрудника → toast об ошибке без запроса', async () => {
    const user = await renderCard()
    await screen.findByText('Иван Иванов')
    await user.type(screen.getByTestId('watcher-employee-id'), 'abc')
    await user.click(screen.getByTestId('watcher-add'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Введите корректный id сотрудника')
    })
    // Запросов POST /watchers не было
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => String(c[0]).includes('/watchers') && c[1]?.method === 'POST')).toBe(false)
  })

  it('удаление watcher кнопкой «Отписать» → DELETE + toast', async () => {
    const user = await renderCard()
    await screen.findByText('Иван Иванов')
    await user.click(screen.getByTestId('watcher-remove-2'))
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/1/watchers/2'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Подписка отменена')
    })
  })

  it('пустое состояние для тикета без подписчиков', async () => {
    mockApi({ watchers: [] })
    await renderCard()
    await waitFor(() => {
      expect(screen.getByText('Нет подписчиков')).toBeInTheDocument()
    })
  })

  it('ошибка загрузки → пустой список без краха', async () => {
    mockApi({ failList: true })
    await renderCard()
    await waitFor(() => {
      expect(screen.getByText('Нет подписчиков')).toBeInTheDocument()
    })
  })
})
