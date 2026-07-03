import pool from './db.js'

let cache = null

export async function getSettings() {
  if (cache) return cache
  try {
    const [rows] = await pool.query('SELECT `key`, `value` FROM admin_settings')
    cache = {}
    for (const r of rows) cache[r.key] = r.value
    return cache
  } catch {
    return {}
  }
}

export function getSetting(key) {
  if (cache && cache[key] !== undefined) return cache[key]
  return process.env[key]
}

export function invalidateCache() {
  cache = null
}
