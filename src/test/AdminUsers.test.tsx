import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import AdminUsers from '@/pages/AdminUsers'

describe('AdminUsers', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 1,
                name: 'Alice Smith',
                email: 'alice@test.com',
                role: 'admin',
                department: 'IT',
                title: 'Admin',
                online: true,
                activeTickets: 3,
                resolvedToday: 5,
                isActive: true,
                createdAt: '2025-01-01',
              },
              {
                id: 2,
                name: 'Bob Jones',
                email: 'bob@test.com',
                role: 'agent',
                department: 'Support',
                title: 'Agent',
                online: false,
                activeTickets: 1,
                resolvedToday: 2,
                isActive: false,
                createdAt: '2025-06-01',
              },
            ],
          }),
      }),
    )
  })

  it('renders user list from API', async () => {
    render(<AdminUsers />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeTruthy()
    })
    expect(screen.getByText('Bob Jones')).toBeTruthy()
  })

  it('shows blocked badge for inactive users', async () => {
    render(<AdminUsers />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText(/admin\.blocked/i)).toBeTruthy()
    })
  })

  it('renders revoke button for each user', async () => {
    render(<AdminUsers />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('revoke-user-1')).toBeTruthy()
    })
    expect(screen.getByTestId('revoke-user-2')).toBeTruthy()
  })

  it('revokes user sessions after confirm', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminUsers />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('revoke-user-1')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('revoke-user-1'))
    await waitFor(() => {
      const revokeCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/admin/sessions/revoke/1'))
      expect(revokeCall).toBeTruthy()
    })
  })

  it('skips revoke when confirm declined', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AdminUsers />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('revoke-user-1')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('revoke-user-1'))
    const calls = fetchMock.mock.calls
    const revokeCall = calls.find((c) => String(c[0]).includes('/api/admin/sessions/revoke/1'))
    expect(revokeCall).toBeFalsy()
  })
})
