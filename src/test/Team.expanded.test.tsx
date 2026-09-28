import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import TeamPage from '@/pages/Team'

let flagOn = true

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => flagOn }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'team.title': 'Команда',
        'team.subtitle': 'Организационная структура',
        'team.disabled': 'Модуль «Команда» выключен',
        'team.empty': 'Нет данных для отображения',
        'admin.refresh': 'Обновить',
        'admin.online': 'Онлайн',
        'admin.offline': 'Офлайн',
        'employees.agent': 'Агент',
        'employees.seniorAgent': 'Старший агент',
        'employees.admin': 'Администратор',
      })[key] || key,
  }),
}))

function mockApi(overrides: { fail?: boolean; empty?: boolean } = {}) {
  globalThis.fetch = vi.fn((url: string, _init: RequestInit) => {
    const path = String(url)
    if (path.includes('/team/org-chart')) {
      if (overrides.fail) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Server error' }),
        })
      }
      const data = overrides.empty
        ? []
        : [
            {
              id: 1,
              name: 'Admin User',
              email: 'admin@test.com',
              role: 'admin',
              department: 'IT',
              title: '',
              avatar: '',
              online: true,
              manager_id: null,
            },
            {
              id: 2,
              name: 'Иван Иванов',
              email: 'ivan@example.com',
              role: 'senior_agent',
              department: 'Support',
              title: 'Lead',
              avatar: '',
              online: true,
              manager_id: 1,
            },
            {
              id: 3,
              name: 'Пётр Петров',
              email: 'petr@example.com',
              role: 'agent',
              department: 'Support',
              title: '',
              avatar: '',
              online: false,
              manager_id: 2,
            },
          ]
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'not found' }) })
  }) as unknown as typeof fetch
}

async function renderPage() {
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' }))
  localStorage.setItem('token', 'token-123')
  const user = userEvent.setup()
  render(<TeamPage />, { wrapper: AllTheProviders })
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

describe('TeamPage (Этап 66, подфича 2)', () => {
  it('флаг org_chart = off → заглушка «модуль выключен»', async () => {
    flagOn = false
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText('Модуль «Команда» выключен')).toBeInTheDocument()
    })
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument()
  })

  it('флаг on → загружает и строит дерево (иерархия manager_id)', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument()
    })
    expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
    expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/team/org-chart'), expect.anything())
  })

  it('пустой список → «Нет данных для отображения»', async () => {
    mockApi({ empty: true })
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText('Нет данных для отображения')).toBeInTheDocument()
    })
  })

  it('ошибка загрузки → текст ошибки', async () => {
    mockApi({ fail: true })
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('кнопка «Обновить» перезагружает список', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument()
    })
    const callsBefore = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    await userEvent.setup().click(screen.getByText('Обновить'))
    await waitFor(() => {
      expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
