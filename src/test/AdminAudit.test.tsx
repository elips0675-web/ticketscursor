import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import AdminAudit from '@/pages/AdminAudit'
import { api } from '@/lib/api'

describe('AdminAudit', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'get').mockResolvedValue([
      {
        id: 1,
        user_name: 'Admin',
        action: 'created',
        entity_id: 10,
        entity_type: 'ticket',
        details: '{"title":"Bug"}',
        created_at: '2026-07-11T10:00:00Z',
      },
      {
        id: 2,
        user_name: 'User',
        action: 'status_changed',
        entity_id: 11,
        entity_type: 'ticket',
        details: '{"from":"open","to":"closed"}',
        created_at: '2026-07-11T11:00:00Z',
      },
    ])
  })

  it('renders audit log', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    expect(screen.getByText('User')).toBeTruthy()
  })

  it('filters by search', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    screen.getByPlaceholderText(/searchAudit/i)
  })

  it('shows empty state when no logs', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([])
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText(/noAudit/i)).toBeTruthy()
    })
  })

  it('filters logs by search query', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })

    const input = screen.getByPlaceholderText(/searchAudit/i)
    fireEvent.change(input, { target: { value: 'Admin' } })

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    expect(screen.queryByText('User')).toBeNull()
  })

  it('shows all logs when search is cleared', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })

    const input = screen.getByPlaceholderText(/searchAudit/i)
    fireEvent.change(input, { target: { value: 'Admin' } })
    await waitFor(() => {
      expect(screen.queryByText('User')).toBeNull()
    })

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => {
      expect(screen.getByText('User')).toBeTruthy()
    })
  })

  it('shows empty message when search matches nothing', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })

    const input = screen.getByPlaceholderText(/searchAudit/i)
    fireEvent.change(input, { target: { value: 'ZZZZNOMATCH' } })

    await waitFor(() => {
      expect(screen.getByText(/noAudit/i)).toBeTruthy()
    })
  })
})
