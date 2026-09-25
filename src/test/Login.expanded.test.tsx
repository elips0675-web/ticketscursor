import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import Login from '@/pages/Login'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'auth.title': 'Service Desk',
        'auth.email': 'Email',
        'auth.password': 'Пароль',
        'auth.emailPlaceholder': 'ivan@company.ru',
        'auth.passwordPlaceholder': 'Пароль',
        'auth.login': 'Войти',
        'auth.loggingIn': 'Вход...',
        'auth.loginError': 'Ошибка входа',
        'auth.connectionError': 'Ошибка соединения',
        'auth.forgotPassword': 'Забыли пароль?',
        'auth.quickLogin': 'Быстрый вход',
        'auth.loginAsAdmin': 'Войти как Администратор',
        'auth.noAccount': 'Нет аккаунта?',
        'auth.register': 'Регистрация',
        'auth.loginSubtitle': 'Войдите в систему',
        'auth.twoFactorTitle': 'Введите код из приложения-аутентификатора',
        'auth.twoFactorCode': 'Код 2FA',
        'auth.twoFactorVerify': 'Проверить код',
        'auth.twoFactorError': 'Неверный код 2FA',
      })[key] || key,
  }),
}))

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
})

function mockFetchOnce(data: unknown, ok = true) {
  return vi.mocked(fetch).mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(data),
  } as Response)
}

describe('Login form', () => {
  it('renders login form', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText('Service Desk')).toBeTruthy()
  })

  it('renders forgot password link', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText('Забыли пароль?')).toBeInTheDocument()
  })

  it('renders login button', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText('Войти')).toBeInTheDocument()
  })

  it('renders dev login button', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText('Войти как Администратор')).toBeInTheDocument()
  })

  it('renders LDAP button', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText(/LDAP/)).toBeInTheDocument()
  })

  it('shows validation error for empty email on submit', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper: AllTheProviders })
    await user.click(screen.getByText('Войти'))
    await waitFor(() => {
      expect(screen.getByText(/введите корректный email/i)).toBeInTheDocument()
    })
  })

  it('calls login API on submit with valid data', async () => {
    const user = userEvent.setup()
    mockFetchOnce({ data: { token: 'test-token', employee: { id: 1, name: 'Admin', role: 'admin' } } })
    render(<Login />, { wrapper: AllTheProviders })
    await user.type(screen.getByPlaceholderText('ivan@company.ru'), 'admin@test.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'password123')
    await user.click(screen.getByText('Войти'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('shows 2FA step when login returns step=2fa, then verifies code', async () => {
    const user = userEvent.setup()
    mockFetchOnce({ success: true, step: '2fa', tempToken: 'temp-123' })
    mockFetchOnce({ data: { token: '2fa-token', employee: { id: 1, name: 'Admin', role: 'admin' } } })
    render(<Login />, { wrapper: AllTheProviders })

    await user.type(screen.getByPlaceholderText('ivan@company.ru'), 'admin@test.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'password123')
    await user.click(screen.getByText('Войти'))

    await waitFor(() => {
      expect(screen.getByText('Введите код из приложения-аутентификатора')).toBeInTheDocument()
    })

    const codeInput = screen.getByLabelText('Код 2FA')
    await user.type(codeInput, '123456')
    await user.click(screen.getByText('Проверить код'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/2fa/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tempToken: 'temp-123', code: '123456' }),
        }),
      )
    })
    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('2fa-token')
    })
  })

  it('shows error message when 2FA code is invalid', async () => {
    const user = userEvent.setup()
    mockFetchOnce({ success: true, step: '2fa', tempToken: 'temp-123' })
    mockFetchOnce({ message: 'Invalid 2FA code', code: 'INVALID_2FA' }, false)
    render(<Login />, { wrapper: AllTheProviders })

    await user.type(screen.getByPlaceholderText('ivan@company.ru'), 'admin@test.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'password123')
    await user.click(screen.getByText('Войти'))

    await waitFor(() => {
      expect(screen.getByText('Введите код из приложения-аутентификатора')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Код 2FA'), '000000')
    await user.click(screen.getByText('Проверить код'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid 2FA code')
    })
  })

  it('shows error message on login failure', async () => {
    const user = userEvent.setup()
    mockFetchOnce({ message: 'Неверные учетные данные' }, false)
    render(<Login />, { wrapper: AllTheProviders })
    await user.type(screen.getByPlaceholderText('ivan@company.ru'), 'admin@test.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'wrong')
    await user.click(screen.getByText('Войти'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('calls LDAP login API on LDAP button click', async () => {
    const user = userEvent.setup()
    mockFetchOnce({ data: { token: 'ldap-token', employee: { id: 2, name: 'LDAP User', role: 'agent' } } })
    render(<Login />, { wrapper: AllTheProviders })
    await user.type(screen.getByPlaceholderText('ivan@company.ru'), 'user@corp.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'ldap-pass')
    await user.click(screen.getByText(/LDAP/))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/ldap-login', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('calls dev login API on dev login button click', async () => {
    const user = userEvent.setup()
    mockFetchOnce({ data: { token: 'dev-token', employee: { id: 3, name: 'Dev User', role: 'admin' } } })
    render(<Login />, { wrapper: AllTheProviders })
    await user.click(screen.getByText('Войти как Администратор'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/dev-login', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('falls back to demo mode when dev login API fails', async () => {
    const user = userEvent.setup()
    mockFetchOnce(null, false)
    render(<Login />, { wrapper: AllTheProviders })
    await user.click(screen.getByText('Войти как Администратор'))
    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('demo-token')
    })
  })
})
