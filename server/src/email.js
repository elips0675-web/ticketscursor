import nodemailer from 'nodemailer'
import logger from './logger.js'
import { getSettings } from './settings.js'

let transporter = null
let lastSmtpConfig = null

async function getTransporter() {
  let db
  try { db = await getSettings() } catch { db = {} }
  const host = db.SMTP_HOST || process.env.SMTP_HOST
  const user = db.SMTP_USER || process.env.SMTP_USER
  const pass = db.SMTP_PASS || process.env.SMTP_PASS

  if (!host || !user || !pass) {
    transporter = null
    return null
  }

  const config = `${host}:${user}`
  if (transporter && config === lastSmtpConfig) return transporter

  transporter = nodemailer.createTransport({
    host,
    port: Number(db.SMTP_PORT || process.env.SMTP_PORT) || 587,
    secure: (db.SMTP_SECURE || process.env.SMTP_SECURE) === 'true',
    auth: { user, pass },
  })
  lastSmtpConfig = config
  return transporter
}

export async function sendTicketNotification({ to, subject, text }) {
  const t = await getTransporter()
  if (!t) return
  try {
    const db = await getSettings()
    const user = db.SMTP_USER || process.env.SMTP_USER
    const from = db.SMTP_FROM || process.env.SMTP_FROM || user
    await t.sendMail({ from, to, subject, text })
    logger.info(`Email sent to ${to}: ${subject}`)
  } catch (err) {
    logger.error('Email send error:', err)
  }
}
