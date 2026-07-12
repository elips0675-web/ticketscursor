import { describe, it, expect, vi } from 'vitest'

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}))

import jwt from 'jsonwebtoken'
import { authenticateToken, requireRole } from '../middleware.js'
import { hasRole, ROLE_HIERARCHY } from '../utils/roleUtils.js'

function mockReqRes(user) {
  const req = { headers: {}, user }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  return { req, res }
}

describe('authenticateToken', () => {
  it('returns 401 if no auth header', () => {
    const { req, res } = mockReqRes()
    const next = vi.fn()
    authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 if header does not start with Bearer', () => {
    const { req, res } = mockReqRes()
    req.headers.authorization = 'Basic xxx'
    const next = vi.fn()
    authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 403 if token is invalid', () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid') })
    const { req, res } = mockReqRes()
    req.headers.authorization = 'Bearer bad-token'
    const next = vi.fn()
    authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('calls next with decoded user on valid token', () => {
    const decoded = { id: 1, role: 'admin' }
    jwt.verify.mockReturnValue(decoded)
    const { req, res } = mockReqRes()
    req.headers.authorization = 'Bearer valid-token'
    const next = vi.fn()
    authenticateToken(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual(decoded)
  })
})

describe('requireRole', () => {
  it('returns 403 if no user on request', () => {
    const { req, res } = mockReqRes(null)
    const next = vi.fn()
    requireRole('admin')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('passes if user has exact role', () => {
    const { req, res } = mockReqRes({ role: 'admin' })
    const next = vi.fn()
    requireRole('admin')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('passes if user has higher role than required', () => {
    const { req, res } = mockReqRes({ role: 'super_admin' })
    const next = vi.fn()
    requireRole('agent')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks if user has lower role', () => {
    const { req, res } = mockReqRes({ role: 'agent' })
    const next = vi.fn()
    requireRole('admin')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('accepts multiple roles (user meets highest)', () => {
    const { req, res } = mockReqRes({ role: 'super_admin' })
    const next = vi.fn()
    requireRole('admin', 'senior_agent')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks if user does not meet highest of multiple roles', () => {
    const { req, res } = mockReqRes({ role: 'senior_agent' })
    const next = vi.fn()
    requireRole('admin', 'senior_agent')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('blocks unknown role', () => {
    const { req, res } = mockReqRes({ role: 'unknown' })
    const next = vi.fn()
    requireRole('agent')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows requester only if explicitly passed', () => {
    const { req, res } = mockReqRes({ role: 'requester' })
    const next = vi.fn()
    requireRole('requester')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks requester from agent-only routes', () => {
    const { req, res } = mockReqRes({ role: 'requester' })
    const next = vi.fn()
    requireRole('agent')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('hasRole', () => {
  it('returns true for exact match', () => {
    expect(hasRole('admin', 'admin')).toBe(true)
  })

  it('returns true for higher role', () => {
    expect(hasRole('super_admin', 'agent')).toBe(true)
  })

  it('returns false for lower role', () => {
    expect(hasRole('agent', 'admin')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(hasRole('unknown', 'agent')).toBe(false)
  })

  it('requires min role index to be valid', () => {
    expect(hasRole('admin', 'unknown')).toBe(false)
  })

  it('validates all hierarchy levels', () => {
    for (let i = 0; i < ROLE_HIERARCHY.length; i++) {
      for (let j = 0; j < ROLE_HIERARCHY.length; j++) {
        const result = hasRole(ROLE_HIERARCHY[i], ROLE_HIERARCHY[j])
        expect(result).toBe(i >= j)
      }
    }
  })
})
