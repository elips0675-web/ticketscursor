import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import { toast } from 'sonner'
import TicketRelationsCard from '@/components/TicketRelationsCard'

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => true }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.loading': 'Загрузка...',
        'tickets.relations': 'Связи',
        'tickets.relationsEmpty': 'Связи не настроены',
        'tickets.relationParent': 'Родитель',
        'tickets.relationChild': 'Подчинённый',
        'tickets.relationBlockedBy': 'Блокируется',
        'tickets.relationDuplicate': 'Дубликат',
        'tickets.relationRelated': 'Связан',
        'tickets.relationAdd': 'Добавить связь',
        'tickets.relationRemove': 'Удалить связь',
        'tickets.relationAdded': 'Связь добавлена',
        'tickets.relationRemoved': 'Связь удалена',
        'tickets.relationError': 'Не удалось изменить связь',
        'tickets.relationInvalidId': 'Введите корректный id тикета',
        'tickets.relationTicketId': 'ID тикета',
      })[key] || key,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const RELATIONS = [
  {
    id: 21,
    type: 'duplicate',
    type_label: 'Дубликат',
    direction: 'out',
    other_ticket: { id: 2, title: 'Проблема с доступом', status: 'open', priority: 'high' },
    created_by: 1,
    created_at: '2026-07-01T10:00:00Z',
  },
  {
    id: 22,
    type: 'related',
    type_label: 'Связан',
    direction: 'in',
    other_ticket: { id: 5, title: 'Настройка принтера', status: 'resolved', priority: 'medium' },
    created_by: 2,
    created_at: '2026-07-01T12:00:00Z',
  },
]

function mockApi(overrides: { failList?: boolean; relations?: unknown[] } = {}) {
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    if (overrides.failList && path.includes('/relations') && (init?.method || 'GET') === 'GET') {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      })
    }
    if (path.includes('/relations')) {
      const method = init?.method || 'GET'
      if (method === 'GET') {
        const list = overrides.relations ?? RELATIONS
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: list }) })
      }
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                id: 23,
                type: 'related',
                type_label: 'Связан',
                direction: 'out',
                other_ticket: { id: 77, title: 'Новый' },
              },
            }),
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
  render(<TicketRelationsCard ticketId={1} />, { wrapper: AllTheProviders })
  return user
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  mockApi()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
  vi.clearAllMocks()
})

describe('TicketRelationsCard (Этап 64, подфича 2)', () => {
  it('рендерит список связей: бейдж типа + «#id · title»', async () => {
    await renderCard()
    await screen.findByText(/Проблема с доступом/)
    // «Дубликат» (бейдж) есть в списке; «Связан» также встречается в Select — поэтому AllBy
    expect(screen.getAllByText('Дубликат').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Связан').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Настройка принтера/)).toBeInTheDocument()
  })

  it('ссылка ведёт на страницу парного тикета', async () => {
    await renderCard()
    const link = await screen.findByTestId('relation-link-2')
    expect(link).toHaveAttribute('href', '/tickets/2')
  })

  it('добавление связи: POST /relations с relatedTicketId и типом', async () => {
    const user = await renderCard()
    await screen.findByText(/Проблема с доступом/)
    await user.type(screen.getByTestId('relation-ticket-id'), '77')
    await user.click(screen.getByTestId('relation-add'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => String(c[0]).includes('/relations') && c[1]?.method === 'POST')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall[1].body)).toEqual({ relatedTicketId: 77, type: 'related' })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Связь добавлена')
    })
  })

  it('невалидный ID → toast об ошибке без запроса', async () => {
    const user = await renderCard()
    await screen.findByText(/Проблема с доступом/)
    await user.type(screen.getByTestId('relation-ticket-id'), 'abc')
    await user.click(screen.getByTestId('relation-add'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Введите корректный id тикета')
    })
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => String(c[0]).includes('/relations') && c[1]?.method === 'POST')).toBe(false)
  })

  it('удаление связи: DELETE /relations/:relationId → toast', async () => {
    const user = await renderCard()
    await screen.findByText(/Проблема с доступом/)
    await user.click(screen.getByTestId('relation-remove-21'))
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/1/relations/21'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Связь удалена')
    })
  })

  it('пустое состояние: «Связи не настроены»', async () => {
    mockApi({ relations: [] })
    await renderCard()
    await waitFor(() => {
      expect(screen.getByText('Связи не настроены')).toBeInTheDocument()
    })
  })

  it('ошибка загрузки → пустой список без краха', async () => {
    mockApi({ failList: true })
    await renderCard()
    await waitFor(() => {
      expect(screen.getByText('Связи не настроены')).toBeInTheDocument()
    })
  })
})
