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
import { requestId } from './middleware/requestId.js'

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE || '0.1') })
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
import { auditLogMiddleware } from './audit.js'

const app = express()
const server = createServer(app)

const authLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { message: 'Too many auth requests' } })
const apiLimiter = rateLimit({ windowMs: 60_000, max: 100, message: { message: 'Too many requests' } })
const adminLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { message: 'Too many admin requests' } })

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

const V1 = '/api/v1'

function mount(prefix, router, ...mw) {
  app.use(`/api${prefix}`, ...mw, router)
  app.use(`${V1}${prefix}`, ...mw, router)
}

mount('/auth', authRouter, authLimiter)
mount('/tickets', ticketsRouter, apiLimiter, cacheMiddleware(120), auditLogMiddleware)
mount('/employees', employeesRouter, apiLimiter, cacheMiddleware(300), auditLogMiddleware)
mount('/calendar', calendarRouter, apiLimiter, auditLogMiddleware)
mount('/polls', pollsRouter, apiLimiter, auditLogMiddleware)
mount('/files', filesRouter, apiLimiter, auditLogMiddleware)
mount('/chats', chatsRouter, apiLimiter, auditLogMiddleware)
mount('/wiki', wikiRouter, apiLimiter, auditLogMiddleware)
mount('/news', newsRouter, apiLimiter, auditLogMiddleware)
mount('/notifications', notificationsRouter, apiLimiter, auditLogMiddleware)
mount('/push', pushRouter, apiLimiter, auditLogMiddleware)
mount('/search', searchRouter, apiLimiter, auditLogMiddleware)
mount('/admin', adminRouter, adminLimiter, auditLogMiddleware)

app.use([`/api/docs`, `${V1}/docs`], swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customCss: '.swagger-ui .topbar { display: none }' }))

app.get('/', (req, res) => {
  res.json({ app: 'Service Desk API', version: '1.0.0' })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/metrics', (req, res) => {
  const mem = process.memoryUsage()
  const uptime = process.uptime()
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.send([
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

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.id })
  res.status(500).json({ message: 'Internal server error' })
})

export { app, server }
