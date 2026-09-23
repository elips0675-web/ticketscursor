import rateLimit from 'express-rate-limit'

const WINDOW_MS = 60_000
// В dev-режиме (локальная разработка + e2e) лимиты не должны мешать прогонам;
// в production остаются строгие значения.
const IS_DEV = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

export function createLimiters(skip = () => process.env.NODE_ENV === 'test') {
  return {
    authLimiter: rateLimit({
      windowMs: WINDOW_MS,
      skip,
      max: IS_DEV ? 1000 : Number(process.env.RATE_LIMIT_AUTH_MAX) || 10,
      message: { message: 'Too many auth requests' },
    }),
    apiLimiter: rateLimit({
      windowMs: WINDOW_MS,
      skip,
      max: IS_DEV ? 1000 : Number(process.env.RATE_LIMIT_API_MAX) || 100,
      message: { message: 'Too many requests' },
    }),
    adminLimiter: rateLimit({
      windowMs: WINDOW_MS,
      skip,
      max: IS_DEV ? 1000 : Number(process.env.RATE_LIMIT_ADMIN_MAX) || 30,
      message: { message: 'Too many admin requests' },
    }),
  }
}