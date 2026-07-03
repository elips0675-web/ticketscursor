import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Email: SMTP not configured, skipping')
    return null
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transporter
}

export async function sendTicketNotification({ to, subject, text }) {
  const t = getTransporter()
  if (!t) return
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    })
    console.log(`Email sent to ${to}: ${subject}`)
  } catch (err) {
    console.error('Email send error:', err)
  }
}
