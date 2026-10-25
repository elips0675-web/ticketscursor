import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from './setup'
import WidgetInbox from '@/components/widget/WidgetInbox'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const API = 'http://localhost:4000/api'

interface SummaryOverrides {
  id?: number
  visitor_name?: string
  visitor_email?: string | null
  status?: 'open' | 'closed'
  unread_for_agent?: number
  last_message_at?: string
  last_message?: { id: number; sender_type: 'visitor' | 'agent'; sender_name: string; text: string; created_at: string } | null
}

function summary(overrides: SummaryOverrides = {}) {
  return {
    id: 1,
    channel: 'Сайт',
    visitor_name: 'Анна',
    visitor_email: 'anna@example.com',
    status: 'open',
    unread_for_agent: 0,
    last_message_at: '2026-10-24T09:00:00.000Z',
    created_at: '2026-10-24T08:00:00.000Z',
    last_message: {
      id: 1,
      sender_type: 'visitor',
      sender_name: 'Анна',
      text: 'Здравствуйте!',
      created_at: '2026-10-24T09:00:00.000Z',
    },
    ...overrides,
  }
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...summary(),
    visitor_id: 'visitor-1',
    messages: [
      {
        id: 1,
        sender_type: 'visitor',
        sender_name: 'Анна',
        text: 'Здравствуйте!',
        created_at: '2026-10-24T09:00:00.000Z',
      },
      {
        id: 2,
        sender_type: 'agent',
        sender_name: 'Иван',
        text: 'Добрый день!',
        created_at: '2026-10-24T09:05:00.000Z',
      },
    ],
    ...overrides,
  }
}

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WidgetInbox />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WidgetInbox', () => {
  it('показывает открытые обращения с последним сообщением', async () => {
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () =>
        HttpResponse.json({
          success: true,
          data: [summary(), summary({ id: 2, visitor_name: 'Пётр', last_message: null })],
        }),
      ),
    )
    renderInbox()

    expect(await screen.findByText('Анна')).toBeInTheDocument()
    expect(screen.getByText('Пётр')).toBeInTheDocument()
    expect(screen.getByText('Здравствуйте!')).toBeInTheDocument()
  })

  it('показывает пустое состояние', async () => {
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () => HttpResponse.json({ success: true, data: [] })),
    )
    renderInbox()

    expect(await screen.findByText('widget.inbox.empty')).toBeInTheDocument()
    expect(screen.getByText('widget.inbox.emptyHint')).toBeInTheDocument()
  })

  it('переключает фильтр на закрытые обращения', async () => {
    const statuses: string[] = []
    server.use(
      http.get(`${API}/widget-inbox/conversations`, ({ request }) => {
        statuses.push(new URL(request.url).searchParams.get('status') || '')
        return HttpResponse.json({ success: true, data: [summary()] })
      }),
    )
    renderInbox()
    await screen.findByText('Анна')

    await userEvent.setup().click(screen.getByRole('button', { name: 'widget.inbox.closed' }))

    await waitFor(() => expect(statuses).toContain('closed'))
  })

  it('передаёт поисковый запрос в API', async () => {
    const queries: string[] = []
    server.use(
      http.get(`${API}/widget-inbox/conversations`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q') || '')
        return HttpResponse.json({ success: true, data: [summary()] })
      }),
    )
    renderInbox()
    await screen.findByText('Анна')

    await userEvent.setup().type(screen.getByLabelText('widget.inbox.searchPlaceholder'), 'Ан')

    await waitFor(() => expect(queries).toContain('Ан'))
  })

  it('открывает обращение и показывает переписку', async () => {
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () => HttpResponse.json({ success: true, data: [summary()] })),
      http.get(`${API}/widget-inbox/conversations/1`, () => HttpResponse.json({ success: true, data: detail() })),
    )
    renderInbox()
    await userEvent.setup().click(await screen.findByText('Анна'))

    expect(await screen.findByText('Добрый день!')).toBeInTheDocument()
    expect(screen.getByText('widget.inbox.visitor')).toBeInTheDocument()
    expect(screen.getByText('Иван')).toBeInTheDocument()
  })

  it('рендерит rich-карточку оператора в переписке', async () => {
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () => HttpResponse.json({ success: true, data: [summary()] })),
      http.get(`${API}/widget-inbox/conversations/1`, () =>
        HttpResponse.json({
          success: true,
          data: detail({
            messages: [
              {
                id: 2,
                sender_type: 'agent',
                sender_name: 'Иван',
                text: 'Карточка ниже',
                content_type: 'rich_json',
                rich_payload: { blocks: [{ type: 'card', title: 'Счёт готов' }] },
                created_at: '2026-10-24T09:05:00.000Z',
              },
            ],
          }),
        }),
      ),
    )
    renderInbox()
    await userEvent.setup().click(await screen.findByText('Анна'))

    expect(await screen.findByText('Счёт готов')).toBeInTheDocument()
    expect(screen.getByText('Карточка ниже')).toBeInTheDocument()
  })

  it('помечает обращение прочитанным при открытии', async () => {
    const read = vi.fn()
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () =>
        HttpResponse.json({ success: true, data: [summary({ unread_for_agent: 2 })] }),
      ),
      http.get(`${API}/widget-inbox/conversations/1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.post(`${API}/widget-inbox/conversations/1/read`, () => {
        read()
        return HttpResponse.json({ success: true, data: { id: 1, unread_for_agent: 0 } })
      }),
    )
    renderInbox()
    await userEvent.setup().click(await screen.findByText('Анна'))

    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
  })

  it('отправляет ответ оператора и очищает поле', async () => {
    let body: unknown = null
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () => HttpResponse.json({ success: true, data: [summary()] })),
      http.get(`${API}/widget-inbox/conversations/1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.post(`${API}/widget-inbox/conversations/1/messages`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ success: true, data: {} }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderInbox()
    await user.click(await screen.findByText('Анна'))

    const input = await screen.findByLabelText('widget.inbox.replyPlaceholder')
    await user.type(input, 'Ответ оператора')
    await user.click(screen.getByLabelText('widget.inbox.send'))

    await waitFor(() => expect(body).toEqual({ text: 'Ответ оператора' }))
    expect(input).toHaveValue('')
  })

  it('закрывает обращение', async () => {
    const close = vi.fn()
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () => HttpResponse.json({ success: true, data: [summary()] })),
      http.get(`${API}/widget-inbox/conversations/1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.post(`${API}/widget-inbox/conversations/1/close`, () => {
        close()
        return HttpResponse.json({ success: true, data: { id: 1, status: 'closed' } })
      }),
    )
    const user = userEvent.setup()
    renderInbox()
    await user.click(await screen.findByText('Анна'))
    await user.click(await screen.findByLabelText('widget.inbox.close'))

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  it('переоткрывает закрытое обращение', async () => {
    const reopen = vi.fn()
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () =>
        HttpResponse.json({ success: true, data: [summary({ status: 'closed' })] }),
      ),
      http.get(`${API}/widget-inbox/conversations/1`, () =>
        HttpResponse.json({ success: true, data: detail({ status: 'closed' }) }),
      ),
      http.post(`${API}/widget-inbox/conversations/1/reopen`, () => {
        reopen()
        return HttpResponse.json({ success: true, data: { id: 1, status: 'open' } })
      }),
    )
    const user = userEvent.setup()
    renderInbox()
    await user.click(await screen.findByText('Анна'))
    await user.click(await screen.findByLabelText('widget.inbox.reopen'))

    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1))
  })

  it('показывает ошибку загрузки и повторяет запрос', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/widget-inbox/conversations`, () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({ success: false, message: 'fail' }, { status: 500 })
        return HttpResponse.json({ success: true, data: [summary()] })
      }),
    )
    const user = userEvent.setup()
    renderInbox()

    expect(await screen.findByText('widget.inbox.loadError')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'widget.inbox.retry' }))

    expect(await screen.findByText('Анна')).toBeInTheDocument()
  })
})
