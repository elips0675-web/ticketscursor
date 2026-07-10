import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import Chats from '@/pages/Chats'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'chats.title': 'Чаты',
      'chats.searchPlaceholder': 'Поиск чатов...',
      'chats.general': 'Общие',
      'chats.personal': 'Личные',
      'common.noResults': 'Ничего не найдено',
    })[key] || key,
  }),
}))

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('Chats', () => {
  it('renders title', () => {
    render(<Chats />, { wrapper: AllTheProviders })
    expect(screen.getByText('Чаты')).toBeInTheDocument()
  })

  it('shows search input', () => {
    render(<Chats />, { wrapper: AllTheProviders })
    expect(screen.getByLabelText('Поиск чатов...')).toBeInTheDocument()
  })

  it('loads and displays chats from API', async () => {
    render(<Chats />, { wrapper: AllTheProviders })
    const chat = await screen.findByText('Общий чат')
    expect(chat).toBeInTheDocument()
  })
})
