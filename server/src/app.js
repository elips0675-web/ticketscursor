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

app.use('/api/auth', authLimiter, authRouter)
app.use('/api/tickets', apiLimiter, cacheMiddleware(120), auditLogMiddleware, ticketsRouter)
app.use('/api/employees', apiLimiter, cacheMiddleware(300), auditLogMiddleware, employeesRouter)
app.use('/api/calendar', apiLimiter, auditLogMiddleware, calendarRouter)
app.use('/api/polls', apiLimiter, auditLogMiddleware, pollsRouter)
app.use('/api/files', apiLimiter, auditLogMiddleware, filesRouter)
app.use('/api/chats', apiLimiter, auditLogMiddleware, chatsRouter)
app.use('/api/wiki', apiLimiter, auditLogMiddleware, wikiRouter)
app.use('/api/news', apiLimiter, auditLogMiddleware, newsRouter)
app.use('/api/notifications', apiLimiter, auditLogMiddleware, notificationsRouter)
app.use('/api/push', apiLimiter, auditLogMiddleware, pushRouter)
app.use('/api/search', apiLimiter, auditLogMiddleware, searchRouter)
app.use('/api/admin', adminLimiter, auditLogMiddleware, adminRouter)

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customCss: '.swagger-ui .topbar { display: none }' }))

app.get('/', (req, res) => {
  res.json({ app: 'Service Desk API', version: '1.0.0' })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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
