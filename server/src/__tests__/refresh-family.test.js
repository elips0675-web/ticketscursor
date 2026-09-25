import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'

const prismaMock = {
  refresh_tokens: {
    findFirst: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: 1 }),
  },
  employees: {
    findFirst: vi.fn(),
  },
  user_totp: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  feature_flags: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}

vi.mock('../middleware.js', () => ({
  JWT_SECRET: 'test-secret',
  authenticateToken: (req, _res, next) => {
    req.user = { userId: 1, role: 'admin' }
    next()
  },
  requireRole: () => (_req, _res, next) => next(),
}))
vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hash'),
    compare: vi.fn().mockResolvedValue(true),
  },
}))
vi.mock('../email.js', () => ({ sendTicketNotification: vi.fn().mockResolvedValue(true) }))
vi.mock('../validate.js', () => ({
  loginValidation: (_req, _res, next) => next(),
  registerValidation: (_req, _res, next) => next(),
  changePasswordValidation: (_req, _res, next) => next(),
}))
vi.mock('../auth/ldap.js', () => ({ authenticateLDAP: (_req, res) => res.status(200).json({}) }))
vi.mock('../auth/oidc.js', () => ({
  initOIDCClient: vi.fn(),
  getSSOConfig: vi.fn().mockResolvedValue({}),
  isSSOEnabled: vi.fn().mockResolvedValue(false),
  generateSSOState: vi.fn().mockReturnValue('state'),
  generateSSONonce: vi.fn().mockReturnValue('nonce'),
  getSSOAuthorizationUrl: vi.fn().mockResolvedValue(null),
  handleSSOCallback: vi.fn(),
}))
vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

describe('refresh-token family (Этап 59)', () => {
  let router

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.REFRESH_SECRET = 'test-secret-refresh'
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../routes/auth.js')
    router = mod.default
  })

  function mockReqRes(overrides = {}) {
    const req = {
      user: { userId: 1, role: 'admin' },
      cookies: {},
      body: {},
      headers: {},
      ...overrides,
    }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    }
    return { req, res }
  }

  function findHandler(method, path) {
    const stack = router.stack
    for (const layer of stack) {
      if (layer.route && layer.route.path === path && layer.route.methods[method]) {
        return layer.route.stack[layer.route.stack.length - 1].handle
      }
    }
    return null
  }

  describe('POST /login', () => {
    it('создаёт refresh-токен с family_id', async () => {
      prismaMock.employees.findFirst.mockResolvedValue({
        id: 1, email: 'a@b.c', name: 'A', role: 'admin', password_hash: 'hash',
      })
      const handler = findHandler('post', '/login')
      const { req, res } = mockReqRes({ body: { email: 'a@b.c', password: 'secret' } })
      await handler(req, res)
      const created = prismaMock.refresh_tokens.create.mock.calls[0][0].data
      expect(created.user_id).toBe(1)
      expect(created.family_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(created.token).toBeTruthy()
    })
  })

  describe('POST /refresh', () => {
    it('выдаёт новый токен той же семьи и удаляет старый', async () => {
      prismaMock.refresh_tokens.findFirst.mockResolvedValue({ id: 10, family_id: 'fam-1' })
      prismaMock.employees.findFirst.mockResolvedValue({ id: 1, name: 'A', email: 'a@b.c', role: 'admin' })
      const refreshToken = jwt.sign({ userId: 1, familyId: 'fam-1', tokenId: 't1' }, 'test-secret-refresh', { expiresIn: '1h' })
      const handler = findHandler('post', '/refresh')
      const { req, res } = mockReqRes({ cookies: { refreshToken } })
      await handler(req, res)
      expect(prismaMock.refresh_tokens.delete).toHaveBeenCalledWith({ where: { id: 10 } })
      const created = prismaMock.refresh_tokens.create.mock.calls[0][0].data
      expect(created.family_id).toBe('fam-1')
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('reuse украденного токена → 403 и отзыв всей семьи (deleteMany по family_id)', async () => {
      prismaMock.refresh_tokens.findFirst.mockResolvedValue(null)
      const refreshToken = jwt.sign({ userId: 1, familyId: 'fam-stolen' }, 'test-secret-refresh', { expiresIn: '1h' })
      const handler = findHandler('post', '/refresh')
      const { req, res } = mockReqRes({ cookies: { refreshToken } })
      await handler(req, res)
      expect(prismaMock.refresh_tokens.deleteMany).toHaveBeenCalledWith({ where: { family_id: 'fam-stolen' } })
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('без cookie → 401', async () => {
      const handler = findHandler('post', '/refresh')
      const { req, res } = mockReqRes({ cookies: {} })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(401)
    })
  })

  describe('POST /revoke-all', () => {
    it('отзывает все сессии пользователя', async () => {
      prismaMock.refresh_tokens.deleteMany.mockResolvedValue({ count: 3 })
      const handler = findHandler('post', '/revoke-all')
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(prismaMock.refresh_tokens.deleteMany).toHaveBeenCalledWith({ where: { user_id: 1 } })
      expect(res.clearCookie).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { revoked: 3 } })
    })
  })
})