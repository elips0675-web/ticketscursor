import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import { AppLayout } from '@/components/layout/app-layout'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'ru', changeLanguage: vi.fn() },
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}))

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
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
            <MemoryRouter>{children}</MemoryRouter>
          </SocketContext.Provider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin' }))
})

describe('AppLayout', () => {
  it('renders Service Desk title', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const headings = screen.getAllByText('Service Desk')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('renders Dashboard link', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const links = screen.getAllByText(/Дашборд/i)
    expect(links.length).toBeGreaterThan(0)
  })

  it('renders Tickets link', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const links = screen.getAllByText(/Тикеты/i)
    expect(links.length).toBeGreaterThan(0)
  })

  it('renders Chats link', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const links = screen.getAllByText(/Чаты/i)
    expect(links.length).toBeGreaterThan(0)
  })

  it('renders Employees link', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const links = screen.getAllByText(/Сотрудники/i)
    expect(links.length).toBeGreaterThan(0)
  })

  it('renders logout button', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const logoutBtns = screen.getAllByLabelText('Выйти')
    expect(logoutBtns.length).toBeGreaterThan(0)
  })

  it('renders mobile menu button', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const menuBtns = screen.getAllByLabelText('Меню')
    expect(menuBtns.length).toBeGreaterThan(0)
  })

  it('navigates to search on Ctrl+K', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    expect(mockNavigate).toHaveBeenCalledWith('/search')
  })
})
