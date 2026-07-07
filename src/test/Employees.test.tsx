import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import Employees from '@/pages/Employees'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'employees.title': 'Сотрудники',
        'employees.searchPlaceholder': 'Поиск по имени, отделу, email...',
        'common.all': 'Все',
        'employees.agents': 'Агенты',
        'employees.seniorAgents': 'Ст. агенты',
        'employees.admins': 'Администраторы',
        'employees.agent': 'Агент',
        'employees.seniorAgent': 'Ст. агент',
        'employees.admin': 'Администратор',
        'employees.online': 'Онлайн',
        'employees.offline': 'Офлайн',
        'employees.activeTickets': '{count} тикетов',
        'employees.resolvedToday': 'Решено сегодня',
        'employees.noData': 'Нет данных',
        'employees.cardsView': 'Карточки',
        'employees.tableView': 'Таблица',
        'employees.sortName': 'По имени',
        'employees.sortTickets': 'По тикетам',
        'employees.sortResolved': 'По решённым',
      }
      return map[key] || key
    },
  }),
}))

describe('Employees Page', () => {
  it('renders title', () => {
    render(<Employees />, { wrapper: AllTheProviders })
    expect(screen.getByText('Сотрудники')).toBeInTheDocument()
  })

  it('shows search input', () => {
    render(<Employees />, { wrapper: AllTheProviders })
    expect(screen.getByPlaceholderText('Поиск по имени, отделу, email...')).toBeInTheDocument()
  })

  it('shows role filter buttons', () => {
    render(<Employees />, { wrapper: AllTheProviders })
    expect(screen.getByText('Все')).toBeInTheDocument()
    expect(screen.getByText('Агенты')).toBeInTheDocument()
    expect(screen.getByText('Ст. агенты')).toBeInTheDocument()
    expect(screen.getByText('Администраторы')).toBeInTheDocument()
  })

  it('shows view toggle buttons', () => {
    render(<Employees />, { wrapper: AllTheProviders })
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(6)
  })
})
