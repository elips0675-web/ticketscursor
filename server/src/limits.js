import rateLimit from 'express-rate-limit'

const WINDOW_MS = 60_000

export function createLimiters(skip = () => process.env.NODE_ENV === 'test') {
  return {
    authLimiter: rateLimit({
      windowMs: WINDOW_MS,
      skip,
      max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 10,
      message: { message: 'Too many auth requests' },
    }),
    apiLimiter: rateLimit({
      windowMs: WINDOW_MS,
      skip,
      max: Number(process.env.RATE_LIMIT_API_MAX) || 100,
      message: { message: 'Too many requests' },
    }),
    adminLimiter: rateLimit({
      windowMs: WINDOW_MS,
      skip,
      max: Number(process.env.RATE_LIMIT_ADMIN_MAX) || 30,
      message: { message: 'Too many admin requests' },
    }),
  }
}