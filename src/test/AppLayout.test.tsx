import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
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
  mockNavigate.mockClear()
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

  it('не перехватывает Ctrl+K — этим сочетанием владеет командная палитра', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    expect(mockNavigate).not.toHaveBeenCalledWith('/search')
  })

  it('триггер горячих клавиш живёт в шапке layout, а не отдельным блоком над приложением', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const trigger = screen.getByLabelText('shortcuts.title')
    expect(trigger.closest('.flex.h-screen')).not.toBeNull()
  })

  it('нижний блок (Админ/Профиль/Выйти) закреплён вне прокручиваемого nav', () => {
    render(<AppLayout />, { wrapper: TestProviders })
    const nav = screen.getByLabelText('Боковая навигация')
    expect(nav.className).toContain('overflow-y-auto')
    expect(nav.className).toContain('min-h-0')
    expect(nav.contains(screen.getByText('nav.admin'))).toBe(false)
    expect(nav.contains(screen.getByText('auth.logout'))).toBe(false)
  })

  it('закрывает мобильное меню при переходе на десктоп', async () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = []
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
        listeners.push(callback)
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    render(<AppLayout />, { wrapper: TestProviders })
    fireEvent.click(screen.getAllByLabelText('Меню')[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    act(() => {
      listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    window.matchMedia = originalMatchMedia
  })
})
