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

  it('filters by action select', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('audit-action-filter'), { target: { value: 'created' } })
    await waitFor(() => {
      expect(screen.queryByText('User')).toBeNull()
    })
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('filters by entity select', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('audit-entity-filter'), { target: { value: 'ticket' } })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
      expect(screen.getByText('User')).toBeTruthy()
    })
  })

  it('filters logs outside date window', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('audit-from'), { target: { value: '2026-07-12' } })
    await waitFor(() => {
      expect(screen.queryByText('Admin')).toBeNull()
      expect(screen.queryByText('User')).toBeNull()
    })
  })

  it('keeps logs inside date window', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('audit-from'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByTestId('audit-to'), { target: { value: '2026-07-11' } })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
      expect(screen.getByText('User')).toBeTruthy()
    })
  })

  it('resets filters with reset button', async () => {
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    fireEvent.change(screen.getByPlaceholderText(/searchAudit/i), { target: { value: 'User' } })
    await waitFor(() => {
      expect(screen.queryByText('Admin')).toBeNull()
    })
    fireEvent.click(screen.getByLabelText('admin.auditFiltersReset'))
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
  })

  it('exports CSV on button click', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('admin.auditExport'))
    expect(clickSpy).toHaveBeenCalled()
    expect(createSpy).toHaveBeenCalled()
    expect(revokeSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
    createSpy.mockRestore()
    revokeSpy.mockRestore()
  })

  it('shows show more button when more than page size logs', async () => {
    const manyLogs = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      user_name: `User${i}`,
      action: 'created',
      entity_id: i,
      entity_type: 'ticket',
      details: '{}',
      created_at: '2026-07-11T10:00:00Z',
    }))
    vi.spyOn(api, 'get').mockResolvedValue(manyLogs)
    render(<AdminAudit />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('User0')).toBeTruthy()
    })
    expect(screen.getByText(/admin\.auditShowMore/)).toBeTruthy()
    fireEvent.click(screen.getByText(/admin\.auditShowMore/))
    await waitFor(() => {
      expect(screen.getByText('User59')).toBeTruthy()
    })
  })
})
