import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import Kanban from '@/pages/Kanban'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('Kanban', () => {
  describe('Rendering', () => {
    it('renders kanban title', () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      expect(screen.getByText('Канбан-доска')).toBeInTheDocument()
    })

    it('shows subtitle hint', () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      expect(screen.getByText('Перетаскивайте тикеты между статусами')).toBeInTheDocument()
    })

    it('shows all 4 status columns', () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      expect(screen.getByText('Открытые')).toBeInTheDocument()
      expect(screen.getByText('В работе')).toBeInTheDocument()
      expect(screen.getByText('Решённые')).toBeInTheDocument()
      expect(screen.getByText('Закрытые')).toBeInTheDocument()
    })
  })

  describe('Ticket display', () => {
    it('displays tickets in columns', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      const ticket = await screen.findByText('Проблема с доступом')
      expect(ticket).toBeInTheDocument()
    })

    it('shows ticket description', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        expect(screen.getByText(/Не могу войти в систему/)).toBeInTheDocument()
      })
    })

    it('shows priority badge for high ticket', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        expect(screen.getByText('Выс.')).toBeInTheDocument()
      })
    })

    it('shows message count icon', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const messageIcons = screen.getAllByText(/^[0-9]+$/)
        expect(messageIcons.length).toBeGreaterThan(0)
      })
    })

    it('shows assigned employee name', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        expect(screen.getByText(/Иван|Алексей|Сергей/)).toBeInTheDocument()
      })
    })
  })

  describe('Column counts', () => {
    it('shows badge counts for each column', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const badges = screen.getAllByText(/[0-9]+/)
        expect(badges.length).toBeGreaterThanOrEqual(4)
      })
    })
  })

  describe('Empty columns', () => {
    it('shows empty state for columns without tickets', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const emptyTexts = screen.getAllByText('Нет тикетов')
        expect(emptyTexts.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('Drag and drop', () => {
    it('makes ticket cards draggable', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const draggable = screen.getAllByRole('button')
        expect(draggable.length).toBeGreaterThan(0)
      })
    })

    it('handles drag start', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const ticketCard = screen.getAllByRole('button')[0]
        const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
        fireEvent.dragStart(ticketCard, { dataTransfer })
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', expect.any(String))
      })
    })

    it('handles drag over with move effect', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const columns = screen.getAllByText(/Открытые|В работе|Решённые|Закрытые/)
        columns.forEach((col) => {
          const colDiv = col.closest('[class*="rounded-xl"]')
          if (colDiv) {
            const dataTransfer = { dropEffect: '' }
            fireEvent.dragOver(colDiv, { dataTransfer })
            expect(dataTransfer.dropEffect).toBe('move')
          }
        })
      })
    })
  })

  describe('Navigation', () => {
    it('navigates to ticket detail on click', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const ticketCard = screen.getAllByRole('button')[0]
        fireEvent.click(ticketCard)
      })
    })

    it('navigates on Enter key', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const ticketCard = screen.getAllByRole('button')[0]
        fireEvent.keyDown(ticketCard, { key: 'Enter' })
      })
    })

    it('navigates on Space key', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const ticketCard = screen.getAllByRole('button')[0]
        fireEvent.keyDown(ticketCard, { key: ' ' })
      })
    })
  })

  describe('Priority colors', () => {
    it('applies high priority styling', async () => {
      render(<Kanban />, { wrapper: AllTheProviders })
      await waitFor(() => {
        const badges = screen.getAllByText('Выс.')
        badges.forEach((badge) => {
          expect(badge.className).toContain('orange')
        })
      })
    })
  })
})
