import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import Dashboard from '@/pages/Dashboard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'dashboard.title': 'Дашборд',
        'dashboard.subtitle': 'Общая статистика системы тикетов',
        'dashboard.total': 'всего',
        'dashboard.totalTickets': 'Всего тикетов',
        'dashboard.open': 'Открытые',
        'dashboard.active': 'Активные',
        'dashboard.critical': 'критично',
        'dashboard.criticalCount': 'Критических',
        'dashboard.resolved': 'сегодня',
        'dashboard.resolvedToday': 'Решённых',
        'dashboard.employees': 'Сотрудники',
        'dashboard.allEmployees': 'Все сотрудники',
        'dashboard.byStatus': 'Тикеты по статусам',
        'dashboard.recentUpdates': 'Последние обновления',
        'tickets.open': 'Открытые',
        'tickets.inProgress': 'В работе',
        'tickets.resolved': 'Решённые',
        'tickets.closed': 'Закрытые',
        'employees.online': 'Онлайн',
        'employees.offline': 'Офлайн',
        'employees.activeTickets': '{count} тикетов',
      }
      return map[key] || key
    },
  }),
}))

describe('Dashboard', () => {
  it('renders title', () => {
    render(<Dashboard />, { wrapper: AllTheProviders })
    expect(screen.getByText('Дашборд')).toBeInTheDocument()
  })

  it('shows stat cards', () => {
    render(<Dashboard />, { wrapper: AllTheProviders })
    expect(screen.getByText('Всего тикетов')).toBeInTheDocument()
    expect(screen.getByText('Активные')).toBeInTheDocument()
    expect(screen.getByText('Критических')).toBeInTheDocument()
    expect(screen.getByText('Решённых')).toBeInTheDocument()
  })

  it('shows employee section heading', () => {
    render(<Dashboard />, { wrapper: AllTheProviders })
    expect(screen.getByText('Сотрудники')).toBeInTheDocument()
  })

  it('has a link to all employees', () => {
    render(<Dashboard />, { wrapper: AllTheProviders })
    expect(screen.getByText('Все сотрудники')).toBeInTheDocument()
  })
})
