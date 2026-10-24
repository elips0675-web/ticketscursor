import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
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
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'hasPointerCapture', { value: () => false, configurable: true })
  Object.defineProperty(Element.prototype, 'setPointerCapture', { value: () => {}, configurable: true })
  Object.defineProperty(Element.prototype, 'releasePointerCapture', { value: () => {}, configurable: true })
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

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

const API = 'http://localhost:4000/api'

const CANNED = [
  { id: 1, title: 'Приветствие', category: 'greetings', text: 'Здравствуйте, {{customer.name}}!' },
  { id: 2, title: 'Прощание', category: 'closing', text: 'Всего доброго!' },
]

async function openPicker() {
  const user = userEvent.setup()
  render(<TicketDetail />, { wrapper: TestProviders })
  await screen.findByText('Проблема с доступом')
  await user.click(screen.getByLabelText('tickets.cannedResponses'))
  return user
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('TicketDetail — быстрые ответы (CHW-07)', () => {
  it('открывает список и показывает загруженные шаблоны', async () => {
    server.use(http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: CANNED })))

    await openPicker()

    expect(await screen.findByText('Приветствие')).toBeInTheDocument()
    expect(screen.getByText('Прощание')).toBeInTheDocument()
    expect(screen.getByText('greetings')).toBeInTheDocument()
  })

  it('вставляет отрендеренный текст в поле сообщения с ticketId текущего тикета', async () => {
    let body: unknown = null
    server.use(
      http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: CANNED })),
      http.post(`${API}/canned-responses/:id/render`, async ({ request, params }) => {
        body = await request.json()
        return HttpResponse.json({
          success: true,
          data: { id: Number(params.id), title: 'Приветствие', category: 'greetings', text: 'Здравствуйте, Иван!' },
        })
      }),
    )

    const user = await openPicker()
    await user.click(await screen.findByText('Приветствие'))

    await waitFor(() => expect(screen.getByPlaceholderText('tickets.messagePlaceholder')).toHaveValue('Здравствуйте, Иван!'))
    expect(body).toEqual({ ticketId: 1 })
  })

  it('дописывает шаблон к уже набранному тексту', async () => {
    server.use(
      http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: CANNED })),
      http.post(`${API}/canned-responses/:id/render`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 2, title: 'Прощание', category: 'closing', text: 'Всего доброго!' },
        }),
      ),
    )

    const user = userEvent.setup()
    render(<TicketDetail />, { wrapper: TestProviders })
    await screen.findByText('Проблема с доступом')
    const textarea = screen.getByPlaceholderText('tickets.messagePlaceholder')
    await user.type(textarea, 'Мой текст')
    await user.click(screen.getByLabelText('tickets.cannedResponses'))
    await user.click(await screen.findByText('Прощание'))

    await waitFor(() => expect(textarea).toHaveValue('Мой текст\nВсего доброго!'))
  })

  it('показывает пустое состояние, если шаблонов нет', async () => {
    server.use(http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: [] })))

    await openPicker()

    expect(await screen.findByText('tickets.cannedEmpty')).toBeInTheDocument()
  })

  it('показывает пустое состояние, если загрузка упала', async () => {
    server.use(
      http.get(`${API}/canned-responses`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )

    await openPicker()

    expect(await screen.findByText('tickets.cannedEmpty')).toBeInTheDocument()
  })
})
