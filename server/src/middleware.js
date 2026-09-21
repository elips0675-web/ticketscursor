import jwt from 'jsonwebtoken'
import { validateToken } from './services/api-tokens.service.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production')
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' })
  }
  const raw = authHeader.split(' ')[1]

  if (raw.startsWith('sd_')) {
    return validateToken(raw).then(user => {
      if (!user) return res.status(401).json({ message: 'Invalid or expired API token' })
      req.user = {
        userId: user.userId,
        role: user.role,
        name: user.name,
        email: user.email,
        tokenId: user.tokenId,
        scopes: user.scopes,
      }
      next()
    }).catch(() => res.status(403).json({ message: 'Token validation failed' }))
  }

  try {
    const decoded = jwt.verify(raw, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(403).json({ message: 'Invalid token' })
  }
}

const ROLE_HIERARCHY = ['requester', 'agent', 'senior_agent', 'admin', 'super_admin']

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden: insufficient rights' })
    }
    const userLevel = ROLE_HIERARCHY.indexOf(req.user.role)
    const requiredLevel = Math.max(...roles.map(r => ROLE_HIERARCHY.indexOf(r)))
    if (userLevel < requiredLevel || userLevel === -1) {
      return res.status(403).json({ message: 'Forbidden: insufficient rights' })
    }
    next()
  }
}

export { JWT_SECRET }
