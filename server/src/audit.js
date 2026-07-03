import pool from './db.js'

export async function logAudit({ userId, userName, action, entityType, entityId, details }) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [userId, userName || 'Unknown', action, entityType, entityId, details ? JSON.stringify(details) : null],
    )
  } catch (err) {
    console.error('Audit log error:', err)
  }
}
