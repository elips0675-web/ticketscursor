import rateLimit from 'express-rate-limit'
import { getSettings } from './settings.js'

const WINDOW_MS = 60_000
// В dev-режиме (локальная разработка + e2e) лимиты не должны мешать прогонам;
// в production остаются строгие значения.
const IS_DEV = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

// Runtime-переопределения лимитов (Этап 58): хранятся в admin_settings (RATE_LIMITS).
let overrides = { auth: null, api: null, admin: null }

const toPositiveInt = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export async function loadRateLimitOverrides() {
  try {
    const settings = await getSettings()
    const raw = settings.RATE_LIMITS
    if (!raw) {
      overrides = { auth: null, api: null, admin: null }
      return
    }
    const parsed = JSON.parse(raw)
    overrides = {
      auth: toPositiveInt(parsed.auth),
      api: toPositiveInt(parsed.api),
      admin: toPositiveInt(parsed.admin),
    }
  } catch {
    overrides = { auth: null, api: null, admin: null }
  }
}

export function setRateLimitOverrides(next) {
  overrides = {
    auth: toPositiveInt(next?.auth),
    api: toPositiveInt(next?.api),
    admin: toPositiveInt(next?.admin),
  }
}

export function getRateLimitOverrides() {
  return { ...overrides }
}

function effective(name, envKey, fallback) {
  if (IS_DEV) return 1000
  const override = overrides[name]
  if (override != null) return override
  const env = Number(process.env[envKey])
  return Number.isFinite(env) && env > 0 ? Math.round(env) : fallback
}

export function createLimiters(skip = () => process.env.NODE_ENV === 'test') {
  const create = (name, envKey, fallback, message) =>
    rateLimit({
      windowMs: WINDOW_MS,
      skip,
      limit: () => (skip() ? 10_000 : effective(name, envKey, fallback)),
      message: { message },
    })
  return {
    authLimiter: create('auth', 'RATE_LIMIT_AUTH_MAX', 10, 'Too many auth requests'),
    apiLimiter: create('api', 'RATE_LIMIT_API_MAX', 100, 'Too many requests'),
    adminLimiter: create('admin', 'RATE_LIMIT_ADMIN_MAX', 30, 'Too many admin requests'),
  }
}