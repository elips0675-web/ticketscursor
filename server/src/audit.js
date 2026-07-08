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

// Автоматический audit-log middleware для POST/PUT/DELETE
const ACTION_MAP = { POST: 'created', PUT: 'updated', DELETE: 'deleted' }

export function auditLogMiddleware(req, res, next) {
  const originalJson = res.json.bind(res)
  res.json = function (body) {
    if (res.statusCode < 400) {
      const action = ACTION_MAP[req.method]
      if (action) {
        logAudit({
          userId: req.user?.userId,
          userName: req.user?.name || 'System',
          action,
          entityType: req.baseUrl?.replace('/api/', '') || req.path?.split('/')[1] || 'unknown',
          entityId: req.params?.id || body?.id || null,
          details: { body: req.body, path: req.originalUrl },
        })
      }
    }
    return originalJson(body)
  }
  next()
}
