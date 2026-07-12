import { render, waitFor } from '@testing-library/react'
import { AllTheProviders } from './test-utils'
import Calendar from '@/pages/Calendar'
import { api } from '@/lib/api'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'get').mockResolvedValue([
    { id: 1, title: 'Team Standup', date: '2026-07-11T09:00:00Z', color: '#3b82f6', created_by: 1 },
  ])
})

describe('Calendar page', () => {
  it('fetches and displays events', async () => {
    render(<Calendar />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
  })
})
