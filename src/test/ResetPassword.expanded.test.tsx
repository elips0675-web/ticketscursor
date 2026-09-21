import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { AllTheProviders } from './test-utils'
import ResetPassword from '@/pages/ResetPassword'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockGet = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useSearchParams: () => [{ get: mockGet }],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

beforeEach(() => {
  localStorage.clear()
  mockGet.mockReturnValue('test-token-123')
})

describe('ResetPassword', () => {
  it('shows invalid link message when no token', () => {
    mockGet.mockReturnValue('')
    render(<ResetPassword />, { wrapper: AllTheProviders })
    expect(screen.getByText('auth.resetPasswordInvalidLink')).toBeInTheDocument()
  })

  it('shows set password form when token exists', () => {
    render(<ResetPassword />, { wrapper: AllTheProviders })
    expect(screen.getByText('auth.resetPasswordTitle')).toBeInTheDocument()
  })

  it('shows validation error when passwords mismatch', async () => {
    const user = userEvent.setup()
    render(<ResetPassword />, { wrapper: AllTheProviders })
    const pwInputs = screen.getAllByPlaceholderText(/password/i)
    await user.type(pwInputs[0], 'password123')
    await user.type(pwInputs[1], 'different')
    await user.click(screen.getByText('auth.resetPasswordBtn'))
    expect(screen.getByText('auth.passwordsNoMatch')).toBeInTheDocument()
  })

  it('shows validation error when password too short', async () => {
    const user = userEvent.setup()
    render(<ResetPassword />, { wrapper: AllTheProviders })
    const pwInputs = screen.getAllByPlaceholderText(/password/i)
    await user.type(pwInputs[0], '123')
    await user.type(pwInputs[1], '123')
    await user.click(screen.getByText('auth.resetPasswordBtn'))
    expect(screen.getByText('auth.passwordTooShort')).toBeInTheDocument()
  })

  it('submits password reset successfully', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/reset-password', () => {
        return HttpResponse.json({ success: true })
      }),
    )
    const user = userEvent.setup()
    render(<ResetPassword />, { wrapper: AllTheProviders })
    const pwInputs = screen.getAllByPlaceholderText(/password/i)
    await user.type(pwInputs[0], 'newpassword123')
    await user.type(pwInputs[1], 'newpassword123')
    await user.click(screen.getByText('auth.resetPasswordBtn'))
    await waitFor(() => {
      expect(screen.getByText('auth.resetPasswordSuccess')).toBeInTheDocument()
    })
  })

  it('shows API error on failed reset', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/reset-password', () => {
        return HttpResponse.json({ message: 'Token expired' }, { status: 400 })
      }),
    )
    const user = userEvent.setup()
    render(<ResetPassword />, { wrapper: AllTheProviders })
    const pwInputs = screen.getAllByPlaceholderText(/password/i)
    await user.type(pwInputs[0], 'newpassword123')
    await user.type(pwInputs[1], 'newpassword123')
    await user.click(screen.getByText('auth.resetPasswordBtn'))
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument()
    })
  })

  it('disables submit when fields are empty', () => {
    render(<ResetPassword />, { wrapper: AllTheProviders })
    expect(screen.getByText('auth.resetPasswordBtn')).toBeDisabled()
  })

  it('shows loading state while submitting', async () => {
    server.use(http.post('http://localhost:4000/api/auth/reset-password', () => new Promise(() => {})))
    const user = userEvent.setup()
    render(<ResetPassword />, { wrapper: AllTheProviders })
    const pwInputs = screen.getAllByPlaceholderText(/password/i)
    await user.type(pwInputs[0], 'newpassword123')
    await user.type(pwInputs[1], 'newpassword123')
    await user.click(screen.getByText('auth.resetPasswordBtn'))
    expect(screen.getByText('auth.resetPasswordBtn')).toBeDisabled()
  })
})
