import winston from 'winston'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logDir = path.join(__dirname, '..', 'logs')
fs.mkdirSync(logDir, { recursive: true })

export const LOG_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const LOG_MAX_FILES = 5

export function fileTransportOptions(dir, { maxsize = LOG_MAX_SIZE_BYTES, maxFiles = LOG_MAX_FILES } = {}) {
  return [
    { filename: path.join(dir, 'error.log'), level: 'error', maxsize, maxFiles },
    { filename: path.join(dir, 'combined.log'), maxsize, maxFiles },
  ]
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
          return `${timestamp} ${level}: ${message}${metaStr}`
        }),
      ),
    }),
    ...fileTransportOptions(logDir).map((options) => new winston.transports.File(options)),
  ],
})

export default logger
