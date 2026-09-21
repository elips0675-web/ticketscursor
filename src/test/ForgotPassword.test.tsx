import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import ForgotPassword from '@/pages/ForgotPassword'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
})
