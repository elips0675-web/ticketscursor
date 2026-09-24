import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import AdminQueues from '@/pages/AdminQueues'
import { api } from '@/lib/api'

const STATS = {
  mode: 'bullmq',
  queues: [
    { name: 'email', waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0 },
    { name: 'sla', waiting: 0, active: 0, completed: 4, failed: 1, delayed: 2 },
    { name: 'sync', waiting: 5, active: 2, completed: 20, failed: 0, delayed: 1 },
    { name: 'notify', waiting: 1, active: 0, completed: 6, failed: 2, delayed: 0 },
  ],
  note: 'BullMQ active',
}

describe('AdminQueues', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders queue mode card', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(STATS)
    render(<AdminQueues />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('queue-mode')).toBeTruthy()
    })
    expect(screen.getByText('BullMQ')).toBeTruthy()
  })

  it('renders queue stats cards', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(STATS)
    render(<AdminQueues />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('queue-email')).toBeTruthy()
    })
    expect(screen.getByTestId('queue-email-waiting')).toBeTruthy()
    expect(screen.getByTestId('queue-email-waiting').textContent).toContain('2')
    expect(screen.getByTestId('queue-email-completed').textContent).toContain('10')
  })

  it('shows error card for queue with error', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      mode: 'in-memory',
      queues: [{ name: 'email', error: 'Redis not configured' }],
      note: 'In-memory fallback',
    })
    render(<AdminQueues />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('queue-email')).toBeTruthy()
    })
    expect(screen.getByText('Redis not configured')).toBeTruthy()
  })

  it('shows note for in-memory mode', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      mode: 'in-memory',
      queues: [],
      note: 'In-memory fallback',
    })
    render(<AdminQueues />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('queue-mode')).toBeTruthy()
    })
    expect(screen.getByText('In-memory fallback')).toBeTruthy()
  })

  it('paginates with Показать ещё', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(STATS)
    render(<AdminQueues />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByTestId('queue-email')).toBeTruthy()
    })
    expect(screen.queryByTestId('queue-notify')).toBeNull()
    fireEvent.click(screen.getByText('admin.auditShowMore'))
    await waitFor(() => {
      expect(screen.getByTestId('queue-notify')).toBeTruthy()
    })
  })

  it('shows empty state when no stats', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(null)
    render(<AdminQueues />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText(/admin\.queuesNoJobs/)).toBeTruthy()
    })
  })
})
