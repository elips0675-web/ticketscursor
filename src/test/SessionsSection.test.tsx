import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import SessionsSection from '@/components/SessionsSection'

let flagOn = true

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => flagOn }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'profile.sessions': 'Активные сессии',
        'profile.sessionsDesc': 'Устройства, с которых выполнен вход',
        'profile.currentSession': 'Текущая сессия',
        'profile.revokeSession': 'Завершить',
        'profile.revokeAllSessions': 'Завершить все сессии',
        'profile.noSessions': 'Нет активных сессий',
        'profile.sessionRevoked': 'Сессия завершена',
        'profile.sessionsRevoked': 'Все сессии завершены',
      })[key] || key,
  }),
}))

const SESSIONS = [
  {
    id: 11,
    device: 'Chrome · Windows',
    ip: '192.168.1.10',
    createdAt: '2026-09-25T08:00:00Z',
    lastSeenAt: '2026-09-25T09:30:00Z',
    current: true,
  },
  {
    id: 12,
    device: 'Firefox · macOS',
    ip: '192.168.1.20',
    createdAt: '2026-09-24T14:00:00Z',
    lastSeenAt: '2026-09-24T18:00:00Z',
    current: false,
  },
]

function mockApi(overrides: { failList?: boolean; sessions?: unknown[] } = {}) {
  globalThis.fetch = vi.fn((url: string, _init: RequestInit) => {
    const path = String(url)
    if (overrides.failList && path.includes('/auth/sessions')) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      })
    }
    if (path.includes('/auth/sessions') && !path.includes('revoke')) {
      const list = overrides.sessions ?? SESSIONS
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { sessions: list } }),
      })
    }
    if (path.includes('/auth/sessions/') && path.includes('/revoke')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { revoked: true } }),
      })
    }
    if (path.includes('/auth/revoke-all')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { revoked: 2 } }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'not found' }) })
  }) as unknown as typeof fetch
}

async function renderSection() {
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  localStorage.setItem('token', 'token-123')
  const user = userEvent.setup()
  render(<SessionsSection />, { wrapper: AllTheProviders })
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

describe('SessionsSection (Этап 63, подфича 2)', () => {
  it('рендерит список сессий + бейдж «Текущая сессия» только у current', async () => {
    await renderSection()
    await screen.findByText('Активные сессии')
    expect(await screen.findByText('Chrome · Windows')).toBeInTheDocument()
    expect(screen.getByText('Firefox · macOS')).toBeInTheDocument()
    expect(screen.getByText('Текущая сессия')).toBeInTheDocument()
    // Кнопка «Завершить» только у НЕ-текущей сессии (точно один экземпляр текста)
    expect(screen.getAllByText('Завершить')).toHaveLength(1)
    expect(screen.getByText('Завершить все сессии')).toBeInTheDocument()
  })

  it('revoke: клик «Завершить» отправляет POST и убирает сессию из списка', async () => {
    const user = await renderSection()
    await screen.findByText('Firefox · macOS')
    await user.click(screen.getByText('Завершить'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/sessions/12/revoke'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('Firefox · macOS')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Chrome · Windows')).toBeInTheDocument()
    expect(screen.getByText('Сессия завершена')).toBeInTheDocument()
  })

  it('завершение всех сессий: POST /auth/revoke-all → пустой список + инфо', async () => {
    const user = await renderSection()
    await screen.findByText('Chrome · Windows')
    await user.click(screen.getByText('Завершить все сессии'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/revoke-all'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Нет активных сессий')).toBeInTheDocument()
    })
    expect(screen.getByText('Все сессии завершены')).toBeInTheDocument()
  })

  it('пустое состояние: «Нет активных сессий»', async () => {
    mockApi({ sessions: [] })
    await renderSection()
    await waitFor(() => {
      expect(screen.getByText('Нет активных сессий')).toBeInTheDocument()
    })
  })

  it('ошибка загрузки списка → текст ошибки', async () => {
    mockApi({ failList: true })
    await renderSection()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('флаг user_sessions = off → секция не рендерится', async () => {
    flagOn = false
    mockApi()
    await renderSection()
    await waitFor(() => {
      expect(screen.queryByText('Активные сессии')).not.toBeInTheDocument()
    })
  })
})
