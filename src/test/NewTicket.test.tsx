import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import NewTicket from '@/pages/NewTicket'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'tickets.backToTickets': '← Назад к заявкам',
      'tickets.newTicketTitle': 'Создание заявки',
      'tickets.newTicketDesc': 'Заполните форму для создания новой заявки',
      'tickets.subject': 'Тема',
      'tickets.subjectPlaceholder': 'Кратко опишите проблему',
      'tickets.description': 'Описание',
      'tickets.descriptionPlaceholder': 'Подробное описание...',
      'tickets.priority': 'Приоритет',
      'tickets.category': 'Категория',
      'tickets.computerName': 'Имя компьютера',
      'tickets.userAccount': 'Учётная запись',
      'tickets.submit': 'Создать заявку',
      'tickets.prioritySelect': 'Приоритет',
      'tickets.categorySelect': 'Категория',
      'tickets.medium': 'Средний',
      'tickets.support': 'Поддержка',
      'tickets.tags': 'Теги',
      'tickets.tagsPlaceholder': 'тег1, тег2 (через запятую)',
    })[key] || key,
  }),
}))

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('NewTicket', () => {
  it('renders create ticket form', () => {
    render(<NewTicket />, { wrapper: AllTheProviders })
    expect(screen.getByText('Создание заявки')).toBeInTheDocument()
  })

  it('shows title input', () => {
    render(<NewTicket />, { wrapper: AllTheProviders })
    expect(screen.getByText('Тема')).toBeInTheDocument()
  })

  it('shows description textarea', () => {
    render(<NewTicket />, { wrapper: AllTheProviders })
    expect(screen.getByText('Описание')).toBeInTheDocument()
  })

  it('shows priority selector', () => {
    render(<NewTicket />, { wrapper: AllTheProviders })
    expect(screen.getByText('Приоритет')).toBeInTheDocument()
  })

  it('shows category selector', () => {
    render(<NewTicket />, { wrapper: AllTheProviders })
    expect(screen.getByText('Категория')).toBeInTheDocument()
  })

  it('shows tags input', () => {
    render(<NewTicket />, { wrapper: AllTheProviders })
    expect(screen.getByPlaceholderText('тег1, тег2 (через запятую)')).toBeInTheDocument()
  })
})
