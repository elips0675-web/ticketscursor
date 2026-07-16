import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import os from 'os'
import * as Sentry from '@sentry/node'
import logger from './logger.js'
import prisma from './prisma.js'
import { requestId } from './middleware/requestId.js'
import { trackRequest, getMetricsLines } from './middleware/metrics.js'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE || '0.1'),
    beforeSend(event) {
      if (event.exception) {
        event.exception.values?.forEach(v => {
          if (v.stacktrace) {
            v.stacktrace.frames?.forEach(f => { f.vars = undefined })
          }
        })
      }
      if (event.request) {
        const headers = event.request.headers || {}
        if (headers['Authorization']) headers['Authorization'] = '[filtered]'
        if (headers['authorization']) headers['authorization'] = '[filtered]'
        if (headers['Cookie']) headers['Cookie'] = '[filtered]'
        if (headers['cookie']) headers['cookie'] = '[filtered]'
      }
      return event
    },
  })
}
import ticketsRouter from './routes/tickets.js'
import employeesRouter from './routes/employees.js'
import calendarRouter from './routes/calendar.js'
import pollsRouter from './routes/polls.js'
import filesRouter from './routes/files.js'
import chatsRouter from './routes/chats.js'
import wikiRouter from './routes/wiki.js'
import newsRouter from './routes/news.js'
import notificationsRouter from './routes/notifications.js'
import searchRouter from './routes/search.js'
import pushRouter from './routes/push.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './swagger.js'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { JWT_SECRET, authenticateToken } from './middleware.js'
import { cacheMiddleware } from './cache.js'

const app = express()
app.set('trust proxy', 1)
const server = createServer(app)

const rateLimitConfig = { windowMs: 60_000, skip: () => process.env.NODE_ENV === 'test' }
const authLimiter = rateLimit({ ...rateLimitConfig, max: 10, message: { message: 'Too many auth requests' } })
const apiLimiter = rateLimit({ ...rateLimitConfig, max: 100, message: { message: 'Too many requests' } })
const adminLimiter = rateLimit({ ...rateLimitConfig, max: 30, message: { message: 'Too many admin requests' } })

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:4000']
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(helmet())
app.use(requestId)
app.use(trackRequest)
app.use(express.json())
app.use(cookieParser())

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler())
  app.use(Sentry.Handlers.tracingHandler())
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')
app.use('/uploads', (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  try {
    jwt.verify(token, JWT_SECRET)
    if (req.query.token) delete req.query.token
    express.static(uploadsDir)(req, res, next)
  } catch {
    res.status(403).json({ message: 'Invalid token' })
  }
})

function mount(prefix, router, ...mw) {
  app.use(`/api${prefix}`, ...mw, router)
}

mount('/auth', authRouter, authLimiter)
mount('/tickets', ticketsRouter, apiLimiter, cacheMiddleware(120))
mount('/employees', employeesRouter, apiLimiter, cacheMiddleware(300))
mount('/calendar', calendarRouter, apiLimiter)
mount('/polls', pollsRouter, apiLimiter)
mount('/files', filesRouter, apiLimiter)
mount('/chats', chatsRouter, apiLimiter)
mount('/wiki', wikiRouter, apiLimiter)
mount('/news', newsRouter, apiLimiter)
mount('/notifications', notificationsRouter, apiLimiter)
mount('/push', pushRouter, apiLimiter)
mount('/search', searchRouter, apiLimiter)
mount('/admin', adminRouter, adminLimiter)

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customCss: '.swagger-ui .topbar { display: none }' }))

app.get('/', (req, res) => {
  res.json({ app: 'Service Desk API', version: '1.0.0' })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/health/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: true, timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', db: false, timestamp: new Date().toISOString() })
  }
})

app.get('/api/metrics', (req, res) => {
  const mem = process.memoryUsage()
  const uptime = process.uptime()
  const timingLines = getMetricsLines()
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.send([
    ...timingLines,
    `# HELP process_cpu_seconds_total Total user CPU time`,
    `# TYPE process_cpu_seconds_total counter`,
    `process_cpu_seconds_total ${uptime}`,
    `# HELP process_resident_memory_bytes Resident memory size`,
    `# TYPE process_resident_memory_bytes gauge`,
    `process_resident_memory_bytes ${mem.rss}`,
    `# HELP process_heap_bytes Process heap size`,
    `# TYPE process_heap_bytes gauge`,
    `process_heap_bytes ${mem.heapUsed}`,
    `# HELP nodejs_eventloop_lag_seconds Event loop lag`,
    `# TYPE nodejs_eventloop_lag_seconds gauge`,
    `nodejs_eventloop_lag_seconds 0.01`,
  ].join('\n'))
})

app.get('/api/system-info', authenticateToken, (req, res) => {
  res.json({
    computerName: os.hostname(),
    userAccount: `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || ''}`,
    userName: process.env.USERNAME || '',
    domain: process.env.USERDOMAIN || '',
  })
})

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler())
}

app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.id })
  res.status(500).json({ message: 'Internal server error' })
})

export { app, server }
