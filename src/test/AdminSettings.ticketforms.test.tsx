import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import AdminSettings from '@/pages/AdminSettings'
import { api } from '@/lib/api'

// Этап 66 (подфича 3): TicketCategoriesSection в AdminSettings.
// В тестовой среде t() возвращает ключ, MSW отдаёт категорию incident со схемой
// (поле location / label Локация, required).
describe('AdminSettings — Ticket forms (Этап 66, подфича 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('секция рендерится и показывает категории из API со схемой', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('admin.ticketForms')).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('incident')).toBeTruthy()
    })
    // Поле схемы: name = 'location', label = 'Локация'
    expect(screen.getByDisplayValue('location')).toBeTruthy()
    expect(screen.getByDisplayValue('Локация')).toBeTruthy()
  })

  it('добавление новой категории → POST /admin/ticket-categories', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ success: true, data: { id: 99, name: 'network' } })
    const user = userEvent.setup()
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByDisplayValue('incident')).toBeTruthy()
    })
    await user.click(screen.getByText('admin.ticketFormsAddCategory'))
    await waitFor(() => {
      expect(screen.getByTestId('ticket-cat-save-new')).toBeTruthy()
    })
    const nameInput = screen.getByTestId('ticket-cat-name-new')
    await user.type(nameInput, 'network')
    await user.click(screen.getByTestId('ticket-cat-save-new'))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/admin/ticket-categories', expect.objectContaining({ name: 'network' }))
    })
  }, 15000)

  it('удаление категории → DELETE /admin/ticket-categories/:id', async () => {
    const delSpy = vi.spyOn(api, 'delete').mockResolvedValue({ success: true, data: { deleted: true } })
    const user = userEvent.setup()
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByDisplayValue('incident')).toBeTruthy()
    })
    await user.click(screen.getByTestId('ticket-cat-delete-1'))
    await waitFor(() => {
      expect(delSpy).toHaveBeenCalledWith('/admin/ticket-categories/1')
    })
  }, 15000)
})
