import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import AdminSettings from '@/pages/AdminSettings'

describe('AdminSettings', () => {
  it('renders settings page', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /admin\.settings/i })).toBeTruthy()
    })
  })

  it('renders feature flags section with toggles', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-kanban_view')).toBeTruthy()
    })
    const toggle = screen.getByTestId('feature-kanban_view')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles feature flag on click', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-kanban_view')).toBeTruthy()
    })
    const toggle = screen.getByTestId('feature-kanban_view')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('shows rollout percent input for each flag', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-rollout-kanban_view')).toBeTruthy()
    })
    const input = screen.getByTestId('feature-rollout-kanban_view') as HTMLInputElement
    expect(input).toHaveValue(40)
  })

  it('edits rollout percent and shows Save', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-rollout-kanban_view')).toBeTruthy()
    })
    const input = screen.getByTestId('feature-rollout-kanban_view') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    expect(input).toHaveValue(30)
    expect(screen.getByTestId('features-save')).toBeTruthy()
  })

  it('clamps rollout percent to 0-100', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-rollout-dark_theme')).toBeTruthy()
    })
    const input = screen.getByTestId('feature-rollout-dark_theme') as HTMLInputElement
    expect(input).toHaveValue(100)
    await userEvent.clear(input)
    await userEvent.type(input, '150')
    expect(input).toHaveValue(100)
  })
})
