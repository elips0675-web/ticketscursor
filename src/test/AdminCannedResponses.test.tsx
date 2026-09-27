// Этап 68: AdminCannedResponses.tsx — 0% → тесты списка, создания, редактирования, удаления.
// Заодно фиксируем a11y: icon-only кнопки получили aria-label (common.edit / common.delete).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { AllTheProviders } from './test-utils'
import AdminCannedResponses from '@/pages/AdminCannedResponses'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const API = 'http://localhost:4000/api'

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Приветствие',
    text: 'Здравствуйте!',
    category: 'greetings',
    created_by: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AdminCannedResponses (Этап 68)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
    vi.restoreAllMocks()
  })

  it('загружает список с API и показывает a11y-подписи icon-only кнопок', async () => {
    server.use(
      http.get(`${API}/canned-responses`, () =>
        HttpResponse.json({
          success: true,
          data: [item(), item({ id: 2, title: 'Прощание', category: '' })],
        }),
      ),
    )
    render(<AdminCannedResponses />, { wrapper: AllTheProviders })

    expect(await screen.findByText('Приветствие')).toBeInTheDocument()
    expect(screen.getByText('Прощание')).toBeInTheDocument()
    // icon-only кнопки получили доступные имена (a11y: button-name)
    expect(screen.getAllByLabelText('common.edit')).toHaveLength(2)
    expect(screen.getAllByLabelText('common.delete')).toHaveLength(2)
  })

  it('пустое состояние', async () => {
    server.use(http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: [] })))
    render(<AdminCannedResponses />, { wrapper: AllTheProviders })
    expect(await screen.findByText('admin.cannedEmpty')).toBeInTheDocument()
  })

  it('создаёт шаблон: POST → перезагрузка списка', async () => {
    const store: Array<Record<string, unknown>> = [item({ title: 'Старый' })]
    server.use(
      http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: store })),
      http.post(`${API}/canned-responses`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        const created = item({
          id: 3,
          title: body.title as string,
          text: body.text as string,
          category: body.category as string,
        })
        store.push(created)
        return HttpResponse.json({ success: true, data: created }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCannedResponses />, { wrapper: AllTheProviders })
    await screen.findByText('Старый')

    await user.type(screen.getByPlaceholderText('admin.cannedTitle'), 'Новый шаблон')
    await user.type(screen.getByPlaceholderText('admin.cannedCategory'), 'support')
    await user.type(screen.getByPlaceholderText('admin.cannedText'), 'Как дела?')
    await user.click(screen.getByRole('button', { name: 'common.add' }))

    await waitFor(() => {
      expect(screen.getByText('Новый шаблон')).toBeInTheDocument()
    })
  })

  it('редактирует: кнопка edit заполняет форму, save шлёт PUT', async () => {
    let updated = false
    const store: Array<Record<string, unknown>> = [item({ title: 'Приветствие', text: 'Старый текст' })]
    server.use(
      http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: store })),
      http.put(`${API}/canned-responses/:id`, async ({ request }) => {
        updated = true
        const body = (await request.json()) as Record<string, unknown>
        store[0] = { ...store[0], ...body }
        return HttpResponse.json({ success: true, data: store[0] })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCannedResponses />, { wrapper: AllTheProviders })
    await screen.findByText('Приветствие')

    await user.click(screen.getByLabelText('common.edit'))
    const titleInput = screen.getByPlaceholderText('admin.cannedTitle')
    expect((titleInput as HTMLInputElement).value).toBe('Приветствие')

    await user.clear(titleInput)
    await user.type(titleInput, 'Новое приветствие')
    await user.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(updated).toBe(true))
    expect(await screen.findByText('Новое приветствие')).toBeInTheDocument()
  })

  it('удаляет через кнопку с aria-label common.delete', async () => {
    let deleted = false
    const store: Array<Record<string, unknown>> = [item()]
    server.use(
      http.get(`${API}/canned-responses`, () => HttpResponse.json({ success: true, data: store })),
      http.delete(`${API}/canned-responses/:id`, () => {
        deleted = true
        store.length = 0
        return HttpResponse.json({ success: true, data: { deleted: true } })
      }),
    )
    const user = userEvent.setup()
    render(<AdminCannedResponses />, { wrapper: AllTheProviders })
    await screen.findByText('Приветствие')

    await user.click(screen.getByLabelText('common.delete'))
    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByText('admin.cannedEmpty')).toBeInTheDocument()
  })
})
