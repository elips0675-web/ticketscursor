import { spawn } from 'child_process'
import fs from 'fs'
import logger from './logger.js'

const CLAMAV_ENABLED = process.env.CLAMAV_ENABLED === 'true'

export async function scanFile(filePath) {
  if (!CLAMAV_ENABLED) return { ok: true }
  if (!fs.existsSync(filePath)) return { ok: true }

  return new Promise((resolve) => {
    const clam = spawn('clamdscan', ['--no-summary', filePath], { timeout: 30000 })
    let stdout = ''
    let stderr = ''

    clam.stdout.on('data', (data) => { stdout += data.toString() })
    clam.stderr.on('data', (data) => { stderr += data.toString() })
    clam.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true })
      } else if (code === 1) {
        logger.warn('ClamAV detected threat', { file: filePath, result: stdout.trim() })
        resolve({ ok: false, reason: 'Virus detected' })
      } else {
        logger.error('ClamAV error', { code, stderr: stderr.trim() })
        resolve({ ok: true })
      }
    })
    clam.on('error', (err) => {
      logger.error('ClamAV spawn error:', err)
      resolve({ ok: true })
    })
  })
}

export { CLAMAV_ENABLED }
