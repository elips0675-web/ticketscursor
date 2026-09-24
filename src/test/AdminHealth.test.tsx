import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import AdminHealth from '@/pages/AdminHealth'
import { api } from '@/lib/api'

const HEALTH = {
  checks: [
    { name: 'db', label: 'MySQL', ok: true, latency: 12 },
    { name: 'redis', label: 'Redis', ok: true, latency: 3 },
    { name: 'meili', label: 'Meilisearch', ok: false, latency: 0, message: 'MEILI_URL not configured' },
  ],
  queue: { mode: 'bullmq', queues: [{ name: 'email' }, { name: 'sla' }], note: 'BullMQ active' },
  updatedAt: '2026-07-11T12:00:00Z',
}

const MIGRATIONS = {
  applied: [{ name: '001_init.js', batch: 1, time: '2026-01-01T00:00:00Z' }],
  pending: ['003_feature_flags.js'],
  appliedCount: 1,
  pendingCount: 1,
}

describe('AdminHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders health check cards', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('check-db')).toBeTruthy()
    })
    expect(screen.getByTestId('check-redis')).toBeTruthy()
    expect(screen.getByTestId('check-meili')).toBeTruthy()
  })

  it('shows ok/fail badges based on check result', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('check-db')).toBeTruthy()
    })
    const dbCard = screen.getByTestId('check-db')
    const meiliCard = screen.getByTestId('check-meili')
    expect(dbCard.textContent).toContain('admin.healthOk')
    expect(meiliCard.textContent).toContain('admin.healthFail')
  })

  it('shows latency for checks that have it', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('check-db').textContent).toContain('12')
    })
  })

  it('shows queue check card', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('check-queue')).toBeTruthy()
    })
    expect(screen.getByTestId('check-queue').textContent).toContain('BullMQ active')
  })

  it('refresh re-fetches data', async () => {
    const getSpy = vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('check-db')).toBeTruthy()
    })
    const callsBefore = getSpy.mock.calls.length
    fireEvent.click(screen.getByLabelText('admin.healthRefresh'))
    await waitFor(() => {
      expect(getSpy.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('renders migrations table with applied and pending', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('migrations-table')).toBeTruthy()
    })
    expect(screen.getByText('001_init.js')).toBeTruthy()
    expect(screen.getByText('003_feature_flags.js')).toBeTruthy()
  })

  it('shows pending warning banner when migrations pending', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(MIGRATIONS)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('003_feature_flags.js')).toBeTruthy()
    })
    expect(screen.getByText(/admin\.migrationsPending: 003_feature_flags\.js/)).toBeTruthy()
  })

  it('shows empty state when no migrations', async () => {
    const empty = { applied: [], pending: [], appliedCount: 0, pendingCount: 0 }
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/admin/health')) return Promise.resolve(HEALTH)
      if (path.startsWith('/admin/migrations')) return Promise.resolve(empty)
      return Promise.resolve(null)
    })
    render(<AdminHealth />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText(/admin\.migrationsNone/)).toBeTruthy()
    })
  })
})
