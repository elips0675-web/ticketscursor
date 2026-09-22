import { describe, it, expect, vi } from 'vitest'

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}))

vi.mock('../services/api-tokens.service.js', () => ({
  validateToken: vi.fn(),
}))

import jwt from 'jsonwebtoken'
import { validateToken } from '../services/api-tokens.service.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { hasRole, ROLE_HIERARCHY } from '../utils/roleUtils.js'

function mockReqRes(user) {
  return {
    req: { headers: {}, user },
    res: { status: vi.fn().mockReturnThis(), json: vi.fn() },
    next: vi.fn(),
  }
}

describe('RBAC matrix — каждый пользователь × каждый уровень прав', () => {
  const cases = []
  for (const userRole of ROLE_HIERARCHY) {
    for (const minRole of ROLE_HIERARCHY) {
      cases.push({ userRole, minRole, allowed: hasRole(userRole, minRole) })
    }
  }

  it.each(cases)(
    '$userRole → requireRole($minRole): $allowed',
    ({ userRole, minRole, allowed }) => {
      const { req, res, next } = mockReqRes({ role: userRole })
      requireRole(minRole)(req, res, next)
      if (allowed) {
        expect(next).toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalledWith(403)
      } else {
        expect(res.status).toHaveBeenCalledWith(403)
        expect(next).not.toHaveBeenCalled()
      }
    },
  )
})

describe('requireRole — граничные случаи', () => {
  it('блокирует без req.user', () => {
    const { req, res, next } = mockReqRes(null)
    requireRole('agent')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('блокирует неизвестную роль пользователя', () => {
    const { req, res, next } = mockReqRes({ role: 'unknown' })
    requireRole('agent')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('требует самую высокую из перечисленных ролей (agent не проходит senior_agent, admin)', () => {
    const { req, res, next } = mockReqRes({ role: 'agent' })
    requireRole('senior_agent', 'admin')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('пропускает при совпадении любой из перечисленных ролей (senior_agent проходит)', () => {
    const { req, res, next } = mockReqRes({ role: 'senior_agent' })
    requireRole('agent', 'senior_agent')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('пропускает super_admin для любой роли', () => {
    const { req, res, next } = mockReqRes({ role: 'super_admin' })
    requireRole('admin')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('блокирует requester на agent-роутов', () => {
    const { req, res, next } = mockReqRes({ role: 'requester' })
    requireRole('agent')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('hasRole — единичные проверки', () => {
  it('возвращает false для неизвестного minRole', () => {
    expect(hasRole('admin', 'unknown')).toBe(false)
  })

  it('возвращает false для неизвестного userRole', () => {
    expect(hasRole('unknown', 'agent')).toBe(false)
  })

  it('возвращает true для equal и вышележащих ролей', () => {
    expect(hasRole('admin', 'admin')).toBe(true)
    expect(hasRole('super_admin', 'admin')).toBe(true)
    expect(hasRole('agent', 'admin')).toBe(false)
  })
})

describe('authenticateToken — API-токены (sd_*)', () => {
  it('принимает валидный API-токен и заполняет scopes/tokenId', async () => {
    validateToken.mockResolvedValue({
      userId: 5,
      role: 'senior_agent',
      name: 'Робот',
      email: 'robot@example.com',
      tokenId: 7,
      scopes: ['tickets:read', 'tickets:write'],
    })
    const { req, res, next } = mockReqRes()
    req.headers.authorization = 'Bearer sd_klmnop123'
    await authenticateToken(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.user).toMatchObject({ userId: 5, role: 'senior_agent', tokenId: 7, scopes: ['tickets:read', 'tickets:write'] })
  })

  it('отклоняет несуществующий/истёкший API-токен (401)', async () => {
    validateToken.mockResolvedValue(null)
    const { req, res, next } = mockReqRes()
    req.headers.authorization = 'Bearer sd_deadbeef'
    await authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('возвращает 403 при ошибке валидации API-токена', async () => {
    validateToken.mockRejectedValue(new Error('db down'))
    const { req, res, next } = mockReqRes()
    req.headers.authorization = 'Bearer sd_broken'
    await authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('authenticateToken — JWT-токены и заголовки', () => {
  it('возвращает 401 без заголовка Authorization', () => {
    const { req, res, next } = mockReqRes()
    authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('возвращает 401 для заголовка не начинающегося с Bearer', () => {
    const { req, res, next } = mockReqRes()
    req.headers.authorization = 'Basic xxx'
    authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('возвращает 403 для невалидного JWT', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature')
    })
    const { req, res, next } = mockReqRes()
    req.headers.authorization = 'Bearer bad-token'
    authenticateToken(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('пропускает валидный JWT и кладёт декодированного пользователя в req.user', () => {
    const decoded = { userId: 1, role: 'admin', name: 'Иван' }
    jwt.verify.mockReturnValue(decoded)
    const { req, res, next } = mockReqRes()
    req.headers.authorization = 'Bearer valid'
    authenticateToken(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual(decoded)
  })
})