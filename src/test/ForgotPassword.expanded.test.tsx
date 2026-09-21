import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { AllTheProviders } from './test-utils'
import ForgotPassword from '@/pages/ForgotPassword'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  localStorage.clear()
})

describe('ForgotPassword', () => {
  it('renders forgot password form', () => {
    render(<ForgotPassword />, { wrapper: AllTheProviders })
    expect(screen.getByText('auth.forgotPasswordTitle')).toBeInTheDocument()
  })

  it('shows email input', () => {
    render(<ForgotPassword />, { wrapper: AllTheProviders })
    expect(screen.getByText('auth.forgotPasswordDesc')).toBeInTheDocument()
  })

  it('has disabled button when email is empty', () => {
    render(<ForgotPassword />, { wrapper: AllTheProviders })
    expect(screen.getByText('auth.forgotPasswordSendBtn')).toBeDisabled()
  })

  it('enables button after typing email', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />, { wrapper: AllTheProviders })
    const input = screen.getByPlaceholderText('auth.email')
    await user.type(input, 'test@example.com')
    expect(screen.getByText('auth.forgotPasswordSendBtn')).toBeEnabled()
  })

  it('shows sent state after successful submit', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/forgot-password', () => {
        return HttpResponse.json({ success: true })
      }),
    )
    const user = userEvent.setup()
    render(<ForgotPassword />, { wrapper: AllTheProviders })
    await user.type(screen.getByPlaceholderText('auth.email'), 'test@example.com')
    await user.click(screen.getByText('auth.forgotPasswordSendBtn'))
    await waitFor(() => {
      expect(screen.getByText('auth.forgotPasswordEmailSent')).toBeInTheDocument()
    })
  })

  it('shows loading state while submitting', async () => {
    server.use(http.post('http://localhost:4000/api/auth/forgot-password', () => new Promise(() => {})))
    const user = userEvent.setup()
    render(<ForgotPassword />, { wrapper: AllTheProviders })
    await user.type(screen.getByPlaceholderText('auth.email'), 'test@example.com')
    await user.click(screen.getByText('auth.forgotPasswordSendBtn'))
    expect(screen.getByText('auth.forgotPasswordSendBtn')).toBeDisabled()
  })
})
