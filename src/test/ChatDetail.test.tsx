import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import ChatDetail from '@/pages/ChatDetail'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

function createMockSocket() {
  const listeners: Record<string, (...args: unknown[]) => void> = {}
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb
    }),
    off: vi.fn(),
    emit: vi.fn(),
    connected: true,
    listeners,
  }
}

function TestProviders({
  children,
  mockSocket,
}: {
  children: React.ReactNode
  mockSocket?: ReturnType<typeof createMockSocket>
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const socket = mockSocket || createMockSocket()
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SocketContext.Provider
            value={{
              socket,
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

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('ChatDetail', () => {
  it('shows loading state initially', () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    const loaders = document.querySelectorAll('.animate-spin')
    expect(loaders.length).toBeGreaterThan(0)
  })

  it('renders chat messages after loading', async () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    await waitFor(() => {
      expect(screen.getByText('Привет всем!')).toBeInTheDocument()
    })
    expect(screen.getByText('Привет!')).toBeInTheDocument()
  })

  it('shows chat name', async () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    await waitFor(() => {
      expect(screen.getByText('Общий чат')).toBeInTheDocument()
    })
  })

  it('shows input field', async () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    await screen.findByText('Привет всем!')
    expect(screen.getByPlaceholderText('Написать сообщение...')).toBeInTheDocument()
  })

  it('send button is disabled when input is empty', async () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    await screen.findByText('Привет всем!')
    const sendBtn = screen.getByLabelText('Отправить')
    expect(sendBtn).toBeDisabled()
  })

  it('typing in input enables send button', async () => {
    const user = userEvent.setup()
    render(<ChatDetail />, { wrapper: TestProviders })
    await screen.findByText('Привет всем!')
    const input = screen.getByPlaceholderText('Написать сообщение...')
    await user.type(input, 'test')
    const sendBtn = screen.getByLabelText('Отправить')
    expect(sendBtn).not.toBeDisabled()
  })

  it('shows back button', async () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    await screen.findByText('Привет всем!')
    expect(screen.getByLabelText('Назад')).toBeInTheDocument()
  })

  it('shows search button', async () => {
    render(<ChatDetail />, { wrapper: TestProviders })
    await screen.findByText('Привет всем!')
    expect(screen.getByLabelText('Поиск по чату')).toBeInTheDocument()
  })

  it('shows delete button on own messages', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))

    render(<ChatDetail />, { wrapper: TestProviders })
    await screen.findByText('Привет всем!')
    const deleteBtns = screen.getAllByLabelText('Удалить')
    expect(deleteBtns.length).toBeGreaterThan(0)
  })
})
