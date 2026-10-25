import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

const API = 'http://localhost:4000/api'

const RICH = {
  blocks: [
    {
      type: 'card',
      title: 'Счёт готов',
      subtitle: 'Октябрь',
      text: 'Оплатите до 5 ноября.',
      actions: [{ type: 'postback', label: 'Напомнить', value: 'remind' }],
    },
    { type: 'chips', options: [{ label: 'Спасибо', value: 'thanks' }] },
  ],
}

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

function ticketsWith(message: Record<string, unknown>) {
  const ticket = {
    id: 1,
    title: 'Проблема с доступом',
    description: 'Не могу войти в систему',
    status: 'open',
    priority: 'high',
    category: 'incident',
    tags: ['vpn'],
    created_by: 1,
    assigned_to: 2,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    assigned_name: 'Иван Иванов',
    assigned_email: 'ivan@example.com',
    assigned_avatar: '',
    messages: [message],
  }
  return [
    http.get(`${API}/tickets`, () => HttpResponse.json({ data: [ticket], total: 1 })),
    http.get(`${API}/tickets/1`, () => HttpResponse.json({ data: ticket })),
  ]
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('TicketDetail — rich messages (CHW-08)', () => {
  it('рендерит карточку и чипы из сообщения тикета', async () => {
    server.use(
      ...ticketsWith({
        id: 5,
        ticket_id: 1,
        sender_id: 2,
        sender_name: 'Мария',
        text: 'Счёт во вложении',
        content_type: 'rich_json',
        rich_payload: RICH,
        created_at: '2026-07-01T10:00:00Z',
      }),
    )

    render(<TicketDetail />, { wrapper: TestProviders })

    expect(await screen.findByText('Счёт во вложении')).toBeInTheDocument()
    expect(screen.getByText('Счёт готов')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Напомнить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Спасибо' })).toBeDisabled()
  })

  it('обычный текст блоки не рисует', async () => {
    server.use(
      ...ticketsWith({
        id: 6,
        ticket_id: 1,
        sender_id: 2,
        sender_name: 'Мария',
        text: 'Обычное сообщение',
        content_type: 'text',
        rich_payload: null,
        created_at: '2026-07-01T10:00:00Z',
      }),
    )

    render(<TicketDetail />, { wrapper: TestProviders })

    expect(await screen.findByText('Обычное сообщение')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'chats.richMessage' })).not.toBeInTheDocument()
  })
})
