import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import { AdminLayout } from '@/components/layout/admin-layout'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) =>
      ({
        'admin.title': 'Администрирование',
        'admin.users': 'Пользователи',
        'admin.push': 'Push-уведомления',
        'admin.settings': 'Настройки',
        'admin.audit': 'Аудит',
        'admin.health': 'Состояние системы',
        'admin.queues': 'Очереди',
        'admin.rbac': 'RBAC-матрица',
        'admin.cannedResponses': 'Шаблоны ответов',
        'admin.customFields': 'Поля заявок',
        'dashboard.title': 'Дашборд',
        'common.back': 'Назад',
        'common.notFound': 'Страница не найдена',
        'auth.logout': 'Выйти',
      })[k] || k,
    i18n: { language: 'ru', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => null,
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

describe('AdminLayout', () => {
  describe('admin user', () => {
    beforeEach(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin' }))
    })

    it('renders admin layout', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      const headings = screen.getAllByText('Администрирование')
      expect(headings.length).toBeGreaterThan(0)
    })

    it('renders admin nav items', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByText('Дашборд')).toBeInTheDocument()
      expect(screen.getByText('Пользователи')).toBeInTheDocument()
      expect(screen.getByText('Push-уведомления')).toBeInTheDocument()
      expect(screen.getByText('Настройки')).toBeInTheDocument()
      expect(screen.getByText('Аудит')).toBeInTheDocument()
    })

    it('renders new section nav items (health, queues, rbac)', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByText('Состояние системы')).toBeInTheDocument()
      expect(screen.getByText('Очереди')).toBeInTheDocument()
      expect(screen.getByText('RBAC-матрица')).toBeInTheDocument()
    })

    it('nav has descriptive aria-label', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByRole('navigation', { name: /Навигация админки/i })).toBeInTheDocument()
    })

    it('provides skip link to main content', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      const link = screen.getByRole('link', { name: /Перейти к содержимому/i })
      expect(link).toHaveAttribute('href', '#admin-main-content')
    })

    it('main has id target for skip link', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      const main = document.getElementById('admin-main-content')
      expect(main).toBeTruthy()
    })

    it('nav links point to admin sections', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByRole('link', { name: 'Состояние системы' })).toHaveAttribute('href', '/admin/health')
      expect(screen.getByRole('link', { name: 'Очереди' })).toHaveAttribute('href', '/admin/queues')
      expect(screen.getByRole('link', { name: 'RBAC-матрица' })).toHaveAttribute('href', '/admin/rbac')
    })

    it('renders back to main button', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByText('Назад')).toBeInTheDocument()
    })

    it('renders logout button', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByText('Выйти')).toBeInTheDocument()
    })
  })

  describe('non-admin user', () => {
    beforeEach(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('user', JSON.stringify({ id: 2, name: 'Agent', role: 'agent' }))
    })

    it('shows access denied for non-admin', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByText('Страница не найдена')).toBeInTheDocument()
    })

    it('shows back link for non-admin', () => {
      render(<AdminLayout />, { wrapper: TestProviders })
      expect(screen.getByText('Назад')).toBeInTheDocument()
    })
  })
})
