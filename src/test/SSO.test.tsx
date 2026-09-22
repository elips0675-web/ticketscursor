import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { SSOLogin, SSOCallback } from '@/pages/SSO'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'sso.loginTitle': 'Вход через SSO',
        'sso.loginSubtitle': 'Единая корпоративная авторизация',
        'sso.loginButton': 'Войти через корпоративный портал',
        'sso.redirecting': 'Перенаправление...',
        'sso.backToLogin': 'Назад к входу',
        'sso.notConfigured': 'SSO не настроен',
        'sso.failedLoadConfig': 'Не удалось загрузить конфигурацию',
        'sso.failedGenerateUrl': 'Не удалось сформировать URL',
        'sso.loginFailed': 'Ошибка входа',
        'sso.errorTitle': 'Ошибка авторизации',
        'sso.missingAuthCode': 'Отсутствует код авторизации',
        'sso.noToken': 'Не получен токен',
        'sso.authFailed': 'Ошибка аутентификации',
        'sso.processing': 'Обработка...',
      })[key] || key,
  }),
}))

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const { mockLogin } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

describe('SSOLogin', () => {
  const originalLocation = window.location
  const fakeLocation = { href: '' } as unknown as Location

  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockLogin.mockClear()
    Object.defineProperty(window, 'location', { value: fakeLocation, writable: true, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true })
  })

  function renderLogin() {
    return render(
      <MemoryRouter>
        <SSOLogin />
      </MemoryRouter>
    )
  }

  it('renders SSO login title and button', () => {
    mockApi.get.mockResolvedValue({ data: { enabled: true } })
    renderLogin()
    expect(screen.getByText('Вход через SSO')).toBeInTheDocument()
    expect(screen.getByText('Войти через корпоративный портал')).toBeInTheDocument()
  })

  it('shows not configured error when config disabled', async () => {
    mockApi.get.mockResolvedValue({ data: { enabled: false } })
    renderLogin()
    await waitFor(() => {
      expect(screen.getByText('SSO не настроен')).toBeInTheDocument()
    })
  })

  it('shows config load error on fetch failure', async () => {
    mockApi.get.mockRejectedValue(new Error('network'))
    renderLogin()
    await waitFor(() => {
      expect(screen.getByText('Не удалось загрузить конфигурацию')).toBeInTheDocument()
    })
  })

  it('redirects to SSO URL on button click', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/sso/login') return Promise.resolve({ data: { url: 'https://idp.example.com/authorize' } })
      return Promise.resolve({ data: { enabled: true } })
    })
    renderLogin()
    fireEvent.click(await screen.findByText('Войти через корпоративный портал'))
    await waitFor(() => {
      expect(window.location.href).toBe('https://idp.example.com/authorize')
    })
  })

  it('shows error when SSO URL missing', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/sso/login') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: { enabled: true } })
    })
    renderLogin()
    fireEvent.click(await screen.findByText('Войти через корпоративный портал'))
    await waitFor(() => {
      expect(screen.getByText('Не удалось сформировать URL')).toBeInTheDocument()
    })
  })

  it('shows loading state while redirecting', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/sso/login') return new Promise(() => {})
      return Promise.resolve({ data: { enabled: true } })
    })
    renderLogin()
    fireEvent.click(await screen.findByText('Войти через корпоративный портал'))
    expect(await screen.findByText('Перенаправление...')).toBeInTheDocument()
  })

  it('navigates back to login', () => {
    mockApi.get.mockResolvedValue({ data: { enabled: true } })
    renderLogin()
    fireEvent.click(screen.getByText('Назад к входу'))
  })
})

describe('SSOCallback', () => {
  beforeEach(() => {
    mockApi.post.mockReset()
    mockLogin.mockClear()
  })

  function renderCallback(initialEntry = '/sso/callback?code=c1&state=s1') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/sso/callback" element={<SSOCallback />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('logs in and navigates home with valid code+state', async () => {
    mockApi.post.mockResolvedValue({ data: { token: 'jwt-token', employee: { id: 1, name: 'Иван', email: 'i@t.ru', role: 'admin' } } })
    renderCallback()
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('jwt-token')
    })
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('shows error when code missing', async () => {
    renderCallback('/sso/callback?state=s1')
    expect(await screen.findByText('Отсутствует код авторизации')).toBeInTheDocument()
  })

  it('shows error when state missing', async () => {
    renderCallback('/sso/callback?code=c1')
    expect(await screen.findByText('Отсутствует код авторизации')).toBeInTheDocument()
  })

  it('shows error_description from IdP error param', async () => {
    renderCallback('/sso/callback?error=access_denied&error_description=Пользователь отклонил доступ')
    expect(await screen.findByText(/Пользователь отклонил доступ/)).toBeInTheDocument()
  })

  it('shows "no token" error when callback returns empty', async () => {
    mockApi.post.mockResolvedValue({ data: {} })
    renderCallback()
    expect(await screen.findByText('Не получен токен')).toBeInTheDocument()
  })

  it('shows auth failed error on API failure', async () => {
    mockApi.post.mockRejectedValue(new Error('bad code'))
    renderCallback()
    expect(await screen.findByText(/bad code/)).toBeInTheDocument()
  })
})