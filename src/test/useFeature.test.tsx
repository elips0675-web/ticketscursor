import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import {
  useFeature,
  useAllFeatures,
  getRolloutBucket,
  isFeatureEnabledForUser,
  isWithinSchedule,
} from '@/hooks/useFeature'
import { AuthContext, type AuthContextType } from '@/context/AuthContext'
import { server } from './setup'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function authValue(id: number): AuthContextType {
  return {
    user: { id, name: 'Test', email: 'test@test.com', role: 'admin' },
    token: 'token',
    login: () => {},
    logout: () => {},
    isAdmin: true,
    isSenior: true,
    isSuperAdmin: false,
    canManage: true,
    loading: false,
  }
}

function AuthWrapper({ id, children }: { id: number; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue(id)}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('useFeature', () => {
  it('returns true for unknown feature', () => {
    const { result } = renderHook(() => useFeature('unknown_key'), { wrapper: Wrapper })
    expect(result.current).toBe(true)
  })

  it('returns enabled state for known feature', async () => {
    const { result } = renderHook(() => useFeature('new_ticket_form'), { wrapper: Wrapper })
    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('returns disabled state', async () => {
    const { result } = renderHook(() => useFeature('kanban_view'), { wrapper: Wrapper })
    await waitFor(() => {
      expect(result.current).toBe(false)
    })
  })
})

describe('rollout logic (pure)', () => {
  it('100% → always enabled', () => {
    expect(isFeatureEnabledForUser({ enabled: true, rollout_percent: 100 }, 1)).toBe(true)
  })

  it('0% → disabled', () => {
    expect(isFeatureEnabledForUser({ enabled: true, rollout_percent: 0 }, 1)).toBe(false)
  })

  it('disabled flag stays disabled even on 100%', () => {
    expect(isFeatureEnabledForUser({ enabled: false, rollout_percent: 100 }, 1)).toBe(false)
  })

  it('missing flag → default true', () => {
    expect(isFeatureEnabledForUser(undefined, 1)).toBe(true)
  })

  it('no endpoint toggle — missing rollout_percent treated as 100%', () => {
    expect(isFeatureEnabledForUser({ enabled: true, rollout_percent: undefined }, 1)).toBe(true)
  })

  it('bucket is deterministic and in range', () => {
    expect(getRolloutBucket(42)).toBe(getRolloutBucket(42))
    expect(getRolloutBucket('42')).toBe(getRolloutBucket(42))
    expect(getRolloutBucket(1)).toBe(getRolloutBucket(1))
    expect(getRolloutBucket(undefined)).toBe(-1)
    expect(getRolloutBucket(42)).toBeGreaterThanOrEqual(0)
    expect(getRolloutBucket(42)).toBeLessThan(100)
  })

  it('bucket < percent → true, bucket >= percent → false', () => {
    const bucket = getRolloutBucket(7)
    expect(isFeatureEnabledForUser({ enabled: true, rollout_percent: bucket + 1 }, 7)).toBe(true)
    expect(isFeatureEnabledForUser({ enabled: true, rollout_percent: bucket }, 7)).toBe(false)
  })
})

describe('useFeature with rollout (user bucket)', () => {
  beforeEach(() => {
    queryClient.clear()
  })

  const insideId = Array.from({ length: 100 }, (_, i) => i + 1).find((i) => getRolloutBucket(i) < 50) ?? 1
  const outsideId = Array.from({ length: 100 }, (_, i) => i + 1).find((i) => getRolloutBucket(i) >= 50) ?? 51

  it('enabled for user inside rollout (50%)', async () => {
    server.use(
      http.get('http://localhost:4000/api/admin/features', () =>
        HttpResponse.json({
          success: true,
          data: [{ key: 'beta_flag', enabled: true, description: 'beta', rollout_percent: 50 }],
        }),
      ),
    )
    const { result } = renderHook(() => useFeature('beta_flag'), {
      wrapper: ({ children }) => <AuthWrapper id={insideId}>{children}</AuthWrapper>,
    })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('disabled for user outside rollout (50%)', async () => {
    server.use(
      http.get('http://localhost:4000/api/admin/features', () =>
        HttpResponse.json({
          success: true,
          data: [{ key: 'beta_flag', enabled: true, description: 'beta', rollout_percent: 50 }],
        }),
      ),
    )
    const { result } = renderHook(() => useFeature('beta_flag'), {
      wrapper: ({ children }) => <AuthWrapper id={outsideId}>{children}</AuthWrapper>,
    })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('enabled for everyone at 100%', async () => {
    server.use(
      http.get('http://localhost:4000/api/admin/features', () =>
        HttpResponse.json({
          success: true,
          data: [{ key: 'gamma_flag', enabled: true, description: 'gamma', rollout_percent: 100 }],
        }),
      ),
    )
    const { result } = renderHook(() => useFeature('gamma_flag'), {
      wrapper: ({ children }) => <AuthWrapper id={1}>{children}</AuthWrapper>,
    })
    await waitFor(() => expect(result.current).toBe(true))
  })
})

describe('useAllFeatures', () => {
  it('returns array of features', async () => {
    const { result } = renderHook(() => useAllFeatures(), { wrapper: Wrapper })
    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      expect(Array.isArray(result.current.data)).toBe(true)
      expect(result.current.data.length).toBeGreaterThan(0)
    })
  })
})

describe('schedule logic (pure)', () => {
  const at = (h: number, m: number) => new Date(2026, 6, 11, h, m)

  it('null schedule → always within', () => {
    expect(isWithinSchedule(null, at(3, 0))).toBe(true)
    expect(isWithinSchedule(undefined, at(23, 59))).toBe(true)
  })

  it('integer day window', () => {
    const s = { from: '09:00', to: '18:00' }
    expect(isWithinSchedule(s, at(8, 59))).toBe(false)
    expect(isWithinSchedule(s, at(9, 0))).toBe(true)
    expect(isWithinSchedule(s, at(12, 0))).toBe(true)
    expect(isWithinSchedule(s, at(18, 0))).toBe(true)
    expect(isWithinSchedule(s, at(18, 1))).toBe(false)
  })

  it('overnight window (from > to)', () => {
    const s = { from: '22:00', to: '06:00' }
    expect(isWithinSchedule(s, at(23, 0))).toBe(true)
    expect(isWithinSchedule(s, at(2, 0))).toBe(true)
    expect(isWithinSchedule(s, at(12, 0))).toBe(false)
  })

  it('only from → after that time', () => {
    expect(isWithinSchedule({ from: '09:00', to: '' }, at(8, 0))).toBe(false)
    expect(isWithinSchedule({ from: '09:00', to: '' }, at(10, 0))).toBe(true)
  })

  it('only to → before that time', () => {
    expect(isWithinSchedule({ from: '', to: '18:00' }, at(12, 0))).toBe(true)
    expect(isWithinSchedule({ from: '', to: '18:00' }, at(19, 0))).toBe(false)
  })

  it('empty schedule → always within', () => {
    expect(isWithinSchedule({ from: '', to: '' }, at(12, 0))).toBe(true)
  })
})

describe('useFeature with schedule', () => {
  beforeEach(() => {
    queryClient.clear()
  })

  it('flag outside schedule → disabled even if enabled=true', async () => {
    const now = new Date()
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    server.use(
      http.get('http://localhost:4000/api/admin/features', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              key: 'nightly_flag',
              enabled: true,
              description: 'nightly',
              rollout_percent: 100,
              schedule: { from: '23:59', to: '00:01' },
            },
          ],
        }),
      ),
    )
    // Окно 23:59–00:01 (overnight). В 00:00 внутри, иначе — снаружи.
    const { result } = renderHook(() => useFeature('nightly_flag'), {
      wrapper: ({ children }) => <AuthWrapper id={1}>{children}</AuthWrapper>,
    })
    await waitFor(() => {
      if (hour === '00' && Number(minute) <= 1) {
        expect(result.current).toBe(true)
      } else {
        expect(result.current).toBe(false)
      }
    })
  })
})
