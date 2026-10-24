import { spawn } from 'child_process'
import fs from 'fs'
import logger from './logger.js'

const CLAMAV_ENABLED = process.env.CLAMAV_ENABLED === 'true'

let warned = false

export function clamavStatus() {
  const required = process.env.NODE_ENV === 'production'
  const ok = CLAMAV_ENABLED || !required

  if (!CLAMAV_ENABLED && !warned) {
    warned = true
    if (required) {
      logger.error('ClamAV disabled in production — file uploads will be rejected with 503')
    } else {
      logger.warn('ClamAV disabled — uploads are not scanned (dev/test only)')
    }
  }

  return { enabled: CLAMAV_ENABLED, required, ok }
}

export async function scanFile(filePath) {
  if (!CLAMAV_ENABLED) return { ok: true }
  if (!fs.existsSync(filePath)) {
    logger.error('ClamAV: file missing before scan', { file: filePath })
    return { ok: false, reason: 'Scanner unavailable' }
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const clam = spawn('clamdscan', ['--no-summary', filePath], { timeout: 30000 })
    let stdout = ''
    let stderr = ''

    clam.stdout.on('data', (data) => { stdout += data.toString() })
    clam.stderr.on('data', (data) => { stderr += data.toString() })
    clam.on('close', (code, signal) => {
      if (code === 0) {
        finish({ ok: true })
      } else if (code === 1) {
        logger.warn('ClamAV detected threat', { file: filePath, result: stdout.trim() })
        finish({ ok: false, reason: 'Virus detected' })
      } else {
        logger.error('ClamAV error', { code, signal, stderr: stderr.trim() })
        finish({ ok: false, reason: 'Scanner unavailable' })
      }
    })
    clam.on('error', (err) => {
      logger.error('ClamAV spawn error:', err)
      finish({ ok: false, reason: 'Scanner unavailable' })
    })
  })
}

export { CLAMAV_ENABLED }
