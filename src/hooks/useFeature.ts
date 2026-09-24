import { useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { AuthContext } from '@/context/AuthContext'

export interface FeatureFlag {
  key: string
  enabled: boolean
  description: string
  rollout_percent?: number
  schedule?: { from: string; to: string } | null
}

const ROLLOUT_DEFAULT = 100

/** Детерминированный «бакет» (0-99) для идентификатора — стабилен между рендерами/сессиями. */
export function getRolloutBucket(seed: string | number | undefined | null): number {
  if (seed === undefined || seed === null) return -1
  const str = String(seed)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash % 100
}

/** Проверка временного окна активности (HH:MM, поддержка «ночного» окна from > to). */
export function isWithinSchedule(schedule: FeatureFlag['schedule'], now: Date = new Date()): boolean {
  if (!schedule) return true
  const { from, to } = schedule
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (from && to) {
    return from <= to ? current >= from && current <= to : current >= from || current <= to
  }
  if (from) return current >= from
  if (to) return current <= to
  return true
}

function normalizePercent(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return ROLLOUT_DEFAULT
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** Чистая логика rollout: флаг включён для пользователя, если бакет(id) ниже rollout_percent. */
export function isFeatureEnabledForUser(
  flag: Pick<FeatureFlag, 'enabled' | 'rollout_percent'> | undefined,
  userId: number | undefined,
  missingDefault = true,
): boolean {
  if (!flag) return missingDefault
  if (!flag.enabled) return false
  const percent = normalizePercent(flag.rollout_percent)
  if (percent >= ROLLOUT_DEFAULT) return true
  if (percent <= 0) return false
  const bucket = getRolloutBucket(userId)
  // Нет идентичности (аноним/не залогинен) — консервативный fallback: считать включённым.
  if (bucket < 0) return missingDefault
  return bucket < percent
}

function useFeatureFlags() {
  return useQuery<FeatureFlag[]>({
    queryKey: ['feature-flags'],
    queryFn: () => api.get('/admin/features'),
    staleTime: 30_000,
  })
}

export function useFeature(key: string): boolean {
  const { data } = useFeatureFlags()
  const auth = useContext(AuthContext)
  const userId = auth?.user?.id
  return useMemo(() => {
    if (!data) return true
    const flag = data.find((f) => f.key === key)
    if (flag && !isWithinSchedule(flag.schedule)) return false
    return isFeatureEnabledForUser(flag, userId)
  }, [data, key, userId])
}

export function useAllFeatures() {
  return useFeatureFlags()
}
