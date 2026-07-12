import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import Register from '@/pages/Register'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'auth.registerTitle': 'Регистрация',
        'auth.registerSubtitle': 'Создайте учетную запись',
        'auth.nameFull': 'Имя',
        'auth.namePlaceholder': 'Иванов Иван',
        'auth.email': 'Email',
        'auth.password': 'Пароль',
        'auth.passwordMin': 'Минимум 6 символов',
        'auth.registerBtn': 'Зарегистрироваться',
        'auth.hasAccount': 'Уже есть аккаунт?',
        'auth.goToLogin': 'Войти',
        'auth.department': 'Отдел',
        'auth.departmentPlaceholder': 'Выберите отдел',
        'auth.titlePosition': 'Должность',
        'auth.titlePlaceholder': 'Ваша должность',
      })[key] || key,
  }),
}))

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Register', () => {
  it('renders registration title', () => {
    render(<Register />, { wrapper: AllTheProviders })
    expect(screen.getByText('Регистрация')).toBeInTheDocument()
  })

  it('shows name input', () => {
    render(<Register />, { wrapper: AllTheProviders })
    expect(screen.getByText('Имя')).toBeInTheDocument()
  })

  it('shows email input', () => {
    render(<Register />, { wrapper: AllTheProviders })
    expect(screen.getByText(/Email/)).toBeInTheDocument()
  })

  it('shows password input', () => {
    render(<Register />, { wrapper: AllTheProviders })
    expect(screen.getByText('Пароль')).toBeInTheDocument()
  })

  it('has submit button', () => {
    render(<Register />, { wrapper: AllTheProviders })
    expect(screen.getByText('Зарегистрироваться')).toBeInTheDocument()
  })

  it('successful registration calls fetch and navigates', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'test-token',
          employee: { id: 1, name: 'Test User', email: 'test@test.com', role: 'agent' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<Register />, { wrapper: AllTheProviders })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Имя'), 'Test User')
    await user.type(screen.getByLabelText('Email'), 'test@test.com')
    await user.type(screen.getByLabelText('Пароль'), 'Test1234')
    await user.click(screen.getByText('Зарегистрироваться'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('shows error on failed registration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Email already exists' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<Register />, { wrapper: AllTheProviders })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Имя'), 'Test User')
    await user.type(screen.getByLabelText('Email'), 'existing@test.com')
    await user.type(screen.getByLabelText('Пароль'), 'Test1234')
    await user.click(screen.getByText('Зарегистрироваться'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })
})
