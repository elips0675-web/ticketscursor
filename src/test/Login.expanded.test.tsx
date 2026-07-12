import { render, screen } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import Login from '@/pages/Login'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Login form', () => {
  it('renders login form', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText(/service desk/i)).toBeTruthy()
  })

  it('renders forgot password link', () => {
    render(<Login />, { wrapper: AllTheProviders })
    expect(screen.getByText(/auth\.forgotPassword/i)).toBeTruthy()
  })

  it('renders login button', () => {
    render(<Login />, { wrapper: AllTheProviders })
    const buttons = screen.getAllByRole('button', { name: /auth\.login/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })
})
