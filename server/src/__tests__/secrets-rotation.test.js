import { describe, it, expect, beforeAll, vi } from 'vitest'

describe('Secrets rotation — JWT_SECRET="new,old": sign=new, verify=[old,new]', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'new-secret-2,old-secret-1'
    vi.resetModules()
  })

  it('verifyJwtSecret принимает токен, подписанный старым секретом (ротация)', async () => {
    const jwt = (await import('jsonwebtoken')).default
    const { verifyJwtSecret } = await import('../middleware.js')
    const token = jwt.sign({ userId: 7, role: 'agent' }, 'old-secret-1', { expiresIn: '1h' })
    expect(verifyJwtSecret(token).userId).toBe(7)
  })

  it('verifyJwtSecret принимает токен, подписанный новым секретом', async () => {
    const jwt = (await import('jsonwebtoken')).default
    const { verifyJwtSecret } = await import('../middleware.js')
    const token = jwt.sign({ userId: 8, role: 'admin' }, 'new-secret-2', { expiresIn: '1h' })
    expect(verifyJwtSecret(token).role).toBe('admin')
  })

  it('verifyJwtSecret отклоняет токен с неизвестным секретом', async () => {
    const jwt = (await import('jsonwebtoken')).default
    const { verifyJwtSecret } = await import('../middleware.js')
    const token = jwt.sign({ userId: 9 }, 'unknown-secret')
    expect(() => verifyJwtSecret(token)).toThrow()
  })

  it('JWT_SECRET export — первый (новый) секрет для подписи', async () => {
    const { JWT_SECRET } = await import('../middleware.js')
    expect(JWT_SECRET).toBe('new-secret-2')
  })
})