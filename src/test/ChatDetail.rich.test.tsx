import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import { server } from './setup'
import ChatDetail from '@/pages/ChatDetail'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

const API = 'http://localhost:4000/api'

const RICH = {
  blocks: [
    {
      type: 'card',
      title: 'Счёт готов',
      text: 'Оплатите до 5 ноября.',
      actions: [{ type: 'link', label: 'Открыть', url: 'https://example.com/invoice/1' }],
    },
  ],
}

function createMockSocket() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: true,
  }
}

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SocketContext.Provider
            value={{
              socket: createMockSocket() as never,
              connected: true,
              sendMessage: vi.fn(),
              deleteMessage: vi.fn(),
              joinChat: vi.fn(),
              leaveChat: vi.fn(),
              notifyAll: vi.fn(),
              sendTyping: vi.fn(),
              markRead: vi.fn(),
            }}
          >
            <MemoryRouter initialEntries={['/chats/1']}>
              <Routes>
                <Route path="/chats/:id" element={children} />
              </Routes>
            </MemoryRouter>
          </SocketContext.Provider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function chatWith(messages: Record<string, unknown>[]) {
  return http.get(`${API}/chats/1`, () =>
    HttpResponse.json({
      success: true,
      data: { id: 1, name: 'Общий чат', type: 'group', messages, readers: [] },
    }),
  )
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('ChatDetail — rich messages (CHW-08)', () => {
  it('рендерит карточку из rich_payload', async () => {
    server.use(
      chatWith([
        {
          id: 10,
          chat_id: 1,
          sender_id: 2,
          sender_name: 'Мария',
          text: 'Карточка ниже',
          content_type: 'rich_json',
          rich_payload: RICH,
          created_at: '2026-10-24T10:00:00.000Z',
        },
      ]),
    )

    render(<ChatDetail />, { wrapper: TestProviders })

    expect(await screen.findByText('Карточка ниже')).toBeInTheDocument()
    expect(screen.getByText('Счёт готов')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'chats.richMessage' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Открыть/ })).toHaveAttribute(
      'href',
      'https://example.com/invoice/1',
    )
  })

  it('обычный текст не рисует блоки', async () => {
    server.use(
      chatWith([
        {
          id: 11,
          chat_id: 1,
          sender_id: 2,
          sender_name: 'Мария',
          text: 'Просто текст',
          content_type: 'text',
          rich_payload: null,
          created_at: '2026-10-24T10:00:00.000Z',
        },
      ]),
    )

    render(<ChatDetail />, { wrapper: TestProviders })

    expect(await screen.findByText('Просто текст')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'chats.richMessage' })).not.toBeInTheDocument()
  })
})
