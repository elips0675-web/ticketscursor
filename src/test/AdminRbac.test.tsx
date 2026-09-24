import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import AdminRbac from '@/pages/AdminRbac'
import { api } from '@/lib/api'

const MATRIX = {
  roles: ['agent', 'senior_agent', 'admin', 'super_admin'],
  permissions: [
    {
      key: 'ticket.create',
      label: 'Создание тикетов',
      roles: { agent: true, senior_agent: true, admin: true, super_admin: true },
    },
    {
      key: 'ticket.assign',
      label: 'Назначение тикетов',
      roles: { agent: false, senior_agent: true, admin: true, super_admin: true },
    },
    {
      key: 'admin.access',
      label: 'Доступ к админке',
      roles: { agent: false, senior_agent: false, admin: true, super_admin: true },
    },
  ],
}

describe('AdminRbac', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders RBAC matrix', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(MATRIX)
    render(<AdminRbac />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('rbac-matrix')).toBeTruthy()
    })
    expect(screen.getByTestId('perm-ticket.create')).toBeTruthy()
    expect(screen.getByTestId('perm-ticket.assign')).toBeTruthy()
    expect(screen.getByTestId('perm-admin.access')).toBeTruthy()
  })

  it('renders role column headers', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(MATRIX)
    render(<AdminRbac />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('rbac-matrix')).toBeTruthy()
    })
    expect(screen.getByText('Agent')).toBeTruthy()
    expect(screen.getByText('Senior Agent')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
    expect(screen.getByText('Super Admin')).toBeTruthy()
  })

  it('shows allowed cells for granted permissions', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(MATRIX)
    render(<AdminRbac />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('cell-ticket.create-agent')).toBeTruthy()
    })
    const cell = screen.getByTestId('cell-ticket.create-agent')
    expect(cell.getAttribute('aria-label')).toBe('admin.rbacAllowed')
  })

  it('shows denied cells for missing permissions', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(MATRIX)
    render(<AdminRbac />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('cell-ticket.assign-agent')).toBeTruthy()
    })
    const cell = screen.getByTestId('cell-ticket.assign-agent')
    expect(cell.getAttribute('aria-label')).toBe('admin.rbacDenied')
  })

  it('shows info note', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(MATRIX)
    render(<AdminRbac />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('rbac-note')).toBeTruthy()
    })
  })

  it('shows empty state when no data', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(null)
    render(<AdminRbac />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText(/admin\.noAudit/)).toBeTruthy()
    })
  })
})
