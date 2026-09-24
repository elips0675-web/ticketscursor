import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import AdminSettings from '@/pages/AdminSettings'
import { api } from '@/lib/api'

describe('AdminSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

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

  it('renders schedule time inputs for flags with schedule', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-schedule-from-dark_theme')).toBeTruthy()
    })
    const from = screen.getByTestId('feature-schedule-from-dark_theme') as HTMLInputElement
    const to = screen.getByTestId('feature-schedule-to-dark_theme') as HTMLInputElement
    expect(from).toHaveValue('09:00')
    expect(to).toHaveValue('18:00')
  })

  it('edits schedule and shows Save', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('feature-schedule-from-kanban_view')).toBeTruthy()
    })
    const from = screen.getByTestId('feature-schedule-from-kanban_view') as HTMLInputElement
    await userEvent.clear(from)
    await userEvent.type(from, '10:00')
    expect(from).toHaveValue('10:00')
    expect(screen.getByTestId('features-save')).toBeTruthy()
  })

  it('renders restore block', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('restore-block')).toBeTruthy()
    })
  })

  it('restore opens editor and posts content', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ restored: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('restore-block')).toBeTruthy()
    })
    await userEvent.click(screen.getByLabelText('admin.restoreBtn'))
    await waitFor(() => {
      expect(screen.getByTestId('restore-content')).toBeTruthy()
    })
    await userEvent.type(screen.getByTestId('restore-content'), 'INSERT INTO x;')
    await userEvent.click(screen.getByTestId('restore-run'))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/admin/settings/restore', { content: 'INSERT INTO x;' })
    })
  })

  it('restore shows error toast when content empty', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ restored: true })
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('restore-block')).toBeTruthy()
    })
    await userEvent.click(screen.getByLabelText('admin.restoreBtn'))
    await waitFor(() => {
      expect(screen.getByTestId('restore-content')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('restore-run'))
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('reindexes search', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ reindexed: true })
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('reindex-run')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('reindex-run'))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/admin/search/reindex')
    })
  })

  it('revokes all sessions after confirm', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ revoked: 3 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('revoke-all-run')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('revoke-all-run'))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/admin/sessions/revoke-all')
    })
  })

  it('skips revoke-all when confirm declined', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ revoked: 3 })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('revoke-all-run')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('revoke-all-run'))
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('saves rate limits', async () => {
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ updated: true })
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('rate-save')).toBeTruthy()
    })
    await userEvent.type(screen.getByTestId('rate-auth'), '120')
    await userEvent.click(screen.getByTestId('rate-save'))
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/admin/settings/rate-limits', {
        auth: 120,
        api: null,
        admin: null,
      })
    })
  })

  it('shows email preview on button click', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('email-preview-ticketCreatedSubject')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('email-preview-ticketCreatedSubject'))
    await waitFor(() => {
      expect(screen.getByTestId('email-preview-result-ticketCreatedSubject')).toBeTruthy()
    })
    expect(screen.getByTestId('email-preview-text-ticketCreatedSubject').textContent).toContain('Тикет #42')
  })

  it('closes email preview', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('email-preview-ticketCreatedSubject')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('email-preview-ticketCreatedSubject'))
    await waitFor(() => {
      expect(screen.getByTestId('email-preview-close-ticketCreatedSubject')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('email-preview-close-ticketCreatedSubject'))
    await waitFor(() => {
      expect(screen.queryByTestId('email-preview-result-ticketCreatedSubject')).toBeNull()
    })
  })
})
