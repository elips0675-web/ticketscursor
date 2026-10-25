// CHW-10: j/k/Enter в списке тикетов + переход /tickets?focus=search фокусирует поиск.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SocketContext } from '@/context/SocketContext'
import Tickets from '@/pages/Tickets'
import type { ReactNode } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const tickets = [1, 2, 3].map((id) => ({
  id,
  title: `Ticket ${id}`,
  description: `Description ${id}`,
  status: 'open',
  priority: 'medium',
  category: 'bug',
  tags: [] as string[],
  computerName: null,
  userAccount: null,
  createdBy: { id: 1, name: 'User A', email: '', avatar: '' },
  assignedTo: undefined,
  messages: [],
  messages_count: 0,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
}))

vi.mock('@/context/ticket-context', () => ({
  useTickets: () => ({ tickets, loading: false, bulkUpdateTickets: vi.fn(), employees: [] }),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function Wrapper({ children, url = '/tickets' }: { children: ReactNode; url?: string }) {
  return (
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
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
          <LocationProbe />
          {children}
        </SocketContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

function renderTickets(url = '/tickets') {
  return render(
    <Wrapper url={url}>
      <Tickets />
    </Wrapper>,
  )
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-ticket-index]'))
}

function activeIndex(): number {
  return cards().findIndex((card) => card.getAttribute('data-active') === 'true')
}

function pressJ(times = 1) {
  for (let i = 0; i < times; i++) fireEvent.keyDown(window, { key: 'j' })
}

describe('Tickets: навигация по списку с клавиатуры (CHW-10)', () => {
  it('рендерит карточки с индексом для клавиатурной навигации', () => {
    renderTickets()
    expect(cards()).toHaveLength(3)
    expect(cards().map((card) => card.getAttribute('data-ticket-index'))).toEqual(['0', '1', '2'])
    expect(activeIndex()).toBe(-1)
  })

  it('j подсвечивает первую карточку, повторное j — следующую', () => {
    renderTickets()
    pressJ()
    expect(activeIndex()).toBe(0)
    pressJ()
    expect(activeIndex()).toBe(1)
    expect(cards()[0].getAttribute('data-active')).toBeNull()
  })

  it('k возвращает назад и не уходит в минус', () => {
    renderTickets()
    pressJ(2)
    fireEvent.keyDown(window, { key: 'k' })
    expect(activeIndex()).toBe(0)
    fireEvent.keyDown(window, { key: 'k' })
    expect(activeIndex()).toBe(0)
  })

  it('j не выходит за последнюю карточку', () => {
    renderTickets()
    pressJ(6)
    expect(activeIndex()).toBe(2)
  })

  it('Enter открывает выбранную карточку', () => {
    renderTickets()
    pressJ(2)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('location').textContent).toBe('/tickets/2')
  })

  it('Enter без выбранной карточки ничего не открывает', () => {
    renderTickets()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('location').textContent).toBe('/tickets')
  })

  it('Enter не перехватывает нажатие, когда фокус не на странице (например, на кнопке)', () => {
    renderTickets()
    pressJ()
    screen.getByRole('button', { name: 'tickets.new' }).focus()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('location').textContent).toBe('/tickets')
  })

  it('j игнорируется, когда фокус в поле поиска', () => {
    renderTickets()
    const input = screen.getByPlaceholderText('tickets.search')
    input.focus()
    fireEvent.keyDown(input, { key: 'j' })
    expect(activeIndex()).toBe(-1)
  })

  it('j игнорируется при открытом диалоге', () => {
    renderTickets()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    try {
      pressJ()
      expect(activeIndex()).toBe(-1)
    } finally {
      dialog.remove()
    }
  })

  it('?focus=search фокусирует поиск и убирает параметр из адреса', async () => {
    renderTickets('/tickets?focus=search')
    const input = screen.getByPlaceholderText('tickets.search')
    await waitFor(() => expect(document.activeElement).toBe(input))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/tickets'))
  })
})
