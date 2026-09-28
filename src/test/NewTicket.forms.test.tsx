import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import NewTicket from '@/pages/NewTicket'

// Этап 66 (подфича 3) — Ticket forms: динамические поля формы по схеме категории.
// Флаг ticket_forms включён → NewTicket подгружает /tickets/categories и рендерит
// поля из schema активной категории; обязательные поля блокируют submit.

let flagOn = true

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => flagOn }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'tickets.backToTickets': '← Назад к заявкам',
        'tickets.newTicketTitle': 'Создание заявки',
        'tickets.newTicketDesc': 'Заполните форму для создания новой заявки',
        'tickets.subject': 'Тема',
        'tickets.subjectPlaceholder': 'Кратко опишите проблему',
        'tickets.description': 'Описание',
        'tickets.descriptionPlaceholder': 'Подробное описание...',
        'tickets.prioritySelect': 'Приоритет',
        'tickets.categorySelect': 'Категория',
        'tickets.medium': 'Средний',
        'tickets.low': 'Низкий',
        'tickets.high': 'Высокий',
        'tickets.critical': 'Критичный',
        'tickets.bug': 'Баг/Ошибка',
        'tickets.feature': 'Улучшение',
        'tickets.support': 'Поддержка',
        'tickets.incident': 'Инцидент',
        'tickets.other': 'Другое',
        'tickets.tags': 'Теги',
        'tickets.tagsPlaceholder': 'тег1, тег2 (через запятую)',
        'tickets.sysInfo': 'Системная информация',
        'tickets.computerPlaceholder': 'Имя компьютера',
        'tickets.userPlaceholder': 'Учётная запись',
        'tickets.sysInfoAuto': 'Определено автоматически. Можно изменить вручную.',
        'tickets.cancel': 'Отмена',
        'tickets.create': 'Создать тикет',
        'tickets.formFields': 'Поля формы',
        'tickets.selectPlaceholder': 'Выберите...',
      })[key] || key,
  }),
}))

function mockApi() {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.includes('/tickets/categories')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 1,
                name: 'support',
                description: 'Поддержка ПО',
                enabled: true,
                schema: [
                  { name: 'software', label: 'ПО', type: 'text', required: true, options: [] },
                  {
                    name: 'urgency',
                    label: 'Срочность',
                    type: 'select',
                    required: false,
                    options: ['Низкая', 'Высокая'],
                  },
                ],
              },
            ],
          }),
      })
    }
    if (path.includes('/tickets')) {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              id: 99,
              title: 'x',
              description: 'y',
              status: 'open',
              priority: 'medium',
              category: 'support',
              form_data: null,
            },
          }),
      })
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ message: 'not found' }) })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

async function renderPage() {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  const user = userEvent.setup()
  render(<NewTicket />, { wrapper: AllTheProviders })
  return user
}

beforeEach(() => {
  localStorage.clear()
  flagOn = true
  mockApi()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
  vi.clearAllMocks()
})

describe('NewTicket + Ticket forms (Этап 66, подфича 3)', () => {
  it('флаг on и категория со схемой → рендерятся динамические поля', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Поля формы/)).toBeInTheDocument()
    })
    expect(screen.getByText('ПО')).toBeInTheDocument()
    expect(screen.getByText('Срочность')).toBeInTheDocument()
  })

  it('флаг off → динамические поля не рендерятся', async () => {
    flagOn = false
    await renderPage()
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText(/Поля формы/)).not.toBeInTheDocument()
  })

  it('обязательное поле пустое → submit блокируется (POST не уходит)', async () => {
    const fetchMock = mockApi()
    const user = await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Поля формы/)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText('Кратко опишите проблему'), 'Тема теста')
    await user.type(screen.getByPlaceholderText('Подробное описание...'), 'Описание теста')
    // Поле «ПО» (required) оставляем пустым
    await user.click(screen.getByRole('button', { name: 'Создать тикет' }))
    const posts = fetchMock.mock.calls.filter(([u, init]) => {
      const path = String(u)
      return path.includes('/tickets') && !path.includes('/tickets/categories') && (init?.method || 'GET') !== 'GET'
    })
    expect(posts).toHaveLength(0)
  })

  it('заполненные поля → POST /tickets уходит с formData', async () => {
    const fetchMock = mockApi()
    const user = await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Поля формы/)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText('Кратко опишите проблему'), 'Тема форма')
    await user.type(screen.getByPlaceholderText('Подробное описание...'), 'Описание форма')
    await user.type(screen.getByPlaceholderText('ПО'), 'Битрикс24')
    await user.click(screen.getByRole('button', { name: 'Создать тикет' }))
    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([u, init]) => {
        const method = (init?.method || 'GET').toUpperCase()
        return method === 'POST' && String(u).endsWith('/tickets')
      })
      expect(posts.length).toBeGreaterThan(0)
    })
    const post = fetchMock.mock.calls.find(([u, init]) => {
      const method = (init?.method || 'GET').toUpperCase()
      return method === 'POST' && String(u).endsWith('/tickets')
    })
    const body = JSON.parse(String(post![1]?.body))
    expect(body.formData).toEqual([{ name: 'software', value: 'Битрикс24' }])
  })
})
