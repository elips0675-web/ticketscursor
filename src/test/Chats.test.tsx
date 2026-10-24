import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
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
    expect(screen.getByRole('heading', { name: 'Чаты' })).toBeInTheDocument()
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

  it('opens the website widget inbox from the tab', async () => {
    server.use(
      http.get('http://localhost:4000/api/widget-inbox/conversations', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    )
    render(<Chats />, { wrapper: AllTheProviders })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'widget.inbox.tab' }))
    expect(await screen.findByText('widget.inbox.empty')).toBeInTheDocument()
  })
})
