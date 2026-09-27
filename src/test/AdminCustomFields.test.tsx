// Этап 68: AdminCustomFields.tsx — 0% → тесты списка, создания (text/select), редактирования, удаления.
// a11y: select'ы получили aria-label, icon-only Trash2 — aria-label="Delete field".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { AllTheProviders } from './test-utils'
import AdminCustomFields from '@/pages/AdminCustomFields'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const API = 'http://localhost:4000/api'

function field(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Город',
    type: 'text',
    options: null,
    required: true,
    enabled: true,
    category: 'general',
    sort_order: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AdminCustomFields (Этап 68)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
    vi.restoreAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('загружает список полей', async () => {
    server.use(
      http.get(`${API}/admin/custom-fields`, () =>
        HttpResponse.json({ success: true, data: [field(), field({ id: 2, name: 'Отдел', type: 'select' })] }),
      ),
    )
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    expect(await screen.findByText('Город')).toBeInTheDocument()
    expect(screen.getByText('Отдел')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Delete field')).toHaveLength(2)
  })

  it('пустое состояние', async () => {
    server.use(http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: [] })))
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    expect(await screen.findByText(/No custom fields defined/)).toBeInTheDocument()
  })

  it('создаёт текстовое поле', async () => {
    let created: Record<string, unknown> | null = null
    server.use(
      http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: [] })),
      http.post(`${API}/admin/custom-fields`, async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, data: created }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    await screen.findByText(/No custom fields defined/)

    await user.type(screen.getByPlaceholderText('Field name'), 'Город')
    await user.click(screen.getByRole('button', { name: 'Add Field' }))

    await waitFor(() => {
      expect(created).toMatchObject({ name: 'Город', type: 'text', category: 'general', required: false })
    })
  })

  it('создаёт select-поле с опциями из запятой', async () => {
    let created: Record<string, unknown> | null = null
    server.use(
      http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: [] })),
      http.post(`${API}/admin/custom-fields`, async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, data: created }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    await screen.findByText(/No custom fields defined/)

    await user.type(screen.getByPlaceholderText('Field name'), 'Страна')
    await user.selectOptions(screen.getByLabelText('Field type'), 'select')
    await user.type(screen.getByPlaceholderText('Options (comma separated)'), ' Россия , Беларусь , ')
    await user.click(screen.getByRole('button', { name: 'Add Field' }))

    await waitFor(() => {
      expect(created).toMatchObject({ type: 'select', options: ['Россия', 'Беларусь'] })
    })
  })

  it('редактирует поле и сохраняет через PUT', async () => {
    let updated = false
    server.use(
      http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: [field()] })),
      http.put(`${API}/admin/custom-fields/:id`, async () => {
        updated = true
        return HttpResponse.json({ success: true, data: field({ name: 'Новое имя' }) })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    await screen.findByText('Город')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const nameInput = screen.getByDisplayValue('Город')
    await user.clear(nameInput)
    await user.type(nameInput, 'Новое имя')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updated).toBe(true))
  })

  it('удаляет поле после confirm=true', async () => {
    let deleted = false
    const store: Array<Record<string, unknown>> = [field()]
    server.use(
      http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: store })),
      http.delete(`${API}/admin/custom-fields/:id`, () => {
        deleted = true
        store.length = 0
        return HttpResponse.json({ success: true, data: { deleted: true } })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    await screen.findByText('Город')

    await user.click(screen.getByLabelText('Delete field'))
    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByText(/No custom fields defined/)).toBeInTheDocument()
  })

  it('не удаляет при confirm=false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    let deleted = false
    server.use(
      http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: [field()] })),
      http.delete(`${API}/admin/custom-fields/:id`, () => {
        deleted = true
        return HttpResponse.json({ success: true, data: { deleted: true } })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    await screen.findByText('Город')

    await user.click(screen.getByLabelText('Delete field'))
    expect(deleted).toBe(false)
    expect(screen.getByText('Город')).toBeInTheDocument()
  })
})
