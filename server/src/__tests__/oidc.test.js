import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  admin_settings: { findMany: vi.fn() },
  employees: { findFirst: vi.fn(), create: vi.fn() },
  refresh_tokens: { create: vi.fn() },
}))
const openidMock = vi.hoisted(() => ({
  Issuer: { discover: vi.fn() },
  generators: { state: vi.fn(), nonce: vi.fn() },
}))
const loggerMock = vi.hoisted(() => ({ default: { info: vi.fn(), error: vi.fn() } }))
const bcryptCjs = vi.hoisted(() => ({ default: { hash: vi.fn() } }))
const jwtCjs = vi.hoisted(() => ({ default: { sign: vi.fn() } }))

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('openid-client', () => openidMock)
vi.mock('../logger.js', () => loggerMock)
vi.mock('bcryptjs', () => bcryptCjs)
vi.mock('jsonwebtoken', () => jwtCjs)
vi.mock('../middleware.js', () => ({ JWT_SECRET: 'test-secret' }))

const clientInst = {}

const SSO_ROWS = [
  { key: 'SSO_ENABLED', value: 'true' },
  { key: 'SSO_ISSUER_URL', value: 'https://idp.test' },
  { key: 'SSO_CLIENT_ID', value: 'cid' },
  { key: 'SSO_CLIENT_SECRET', value: 'csecret' },
]

describe('auth/oidc.js', () => {
  beforeEach(() => {
    process.env.REFRESH_SECRET = 'test-refresh-secret'
    process.env.SSO_STATE_SECRET = 'test-sso-secret'
    vi.resetModules()
    prismaMock.admin_settings.findMany.mockReset()
    prismaMock.employees.findFirst.mockReset()
    prismaMock.employees.create.mockReset()
    prismaMock.refresh_tokens.create.mockReset()
    jwtCjs.default.sign.mockReset()
    bcryptCjs.default.hash.mockReset().mockResolvedValue('hashed-pass')
    loggerMock.default.info.mockReset()
    loggerMock.default.error.mockReset()
    openidMock.Issuer.discover.mockReset()
    openidMock.generators.state.mockReset().mockReturnValue('state-abc')
    openidMock.generators.nonce.mockReset().mockReturnValue('nonce-abc')
    clientInst.authorizationUrl = vi.fn(() => 'https://idp.test/auth?code=h')
    clientInst.callback = vi.fn().mockResolvedValue({ claims: () => ({ email: 'sso@company.ru', name: 'Иван' }) })
    // openid-client: issuer.Client — это класс, oidc.js делает `new issuer.Client(...)`.
    // Конструктор-класс возвращает clientInst, чтобы тесты управляли его поведением.
    openidMock.Issuer.discover.mockResolvedValue({
      Client: class {
        constructor() {
          return clientInst
        }
      },
    })
  })

  it('getSSOConfig — только ключи с префиксом SSO_', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue([
      { key: 'SSO_ENABLED', value: 'true' },
      { key: 'SSO_ISSUER_URL', value: 'https://idp' },
      { key: 'SSO_CLIENT_ID', value: 'cid' },
    ])
    const { getSSOConfig } = await import('../auth/oidc.js')
    expect(await getSSOConfig()).toEqual({ SSO_ENABLED: 'true', SSO_ISSUER_URL: 'https://idp', SSO_CLIENT_ID: 'cid' })
    expect(prismaMock.admin_settings.findMany).toHaveBeenCalledWith({
      where: { key: { startsWith: 'SSO_' } },
      select: { key: true, value: true },
    })
  })

  it('isSSOEnabled — true только при полной конфигурации', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    const { isSSOEnabled } = await import('../auth/oidc.js')
    expect(await isSSOEnabled()).toBe(true)
  })

  it('isSSOEnabled — false без client_secret', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS.filter(r => r.key !== 'SSO_CLIENT_SECRET'))
    const { isSSOEnabled } = await import('../auth/oidc.js')
    expect(await isSSOEnabled()).toBe(false)
  })

  it('initOIDCClient — null без конфигурации', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue([])
    const { initOIDCClient } = await import('../auth/oidc.js')
    expect(await initOIDCClient()).toBeNull()
  })

  it('initOIDCClient — discover + создание клиента', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    const { initOIDCClient } = await import('../auth/oidc.js')
    const client = await initOIDCClient()
    expect(client).toBe(clientInst)
    expect(openidMock.Issuer.discover).toHaveBeenCalledWith('https://idp.test')
    expect(loggerMock.default.info).toHaveBeenCalled()
  })

  it('initOIDCClient — ошибка discover → null (не падает)', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    openidMock.Issuer.discover.mockRejectedValue(new Error('boom'))
    const { initOIDCClient } = await import('../auth/oidc.js')
    expect(await initOIDCClient()).toBeNull()
    expect(loggerMock.default.error).toHaveBeenCalled()
  })

  it('generateSSOState/Nonce', async () => {
    const { generateSSOState, generateSSONonce } = await import('../auth/oidc.js')
    expect(generateSSOState()).toBe('state-abc')
    expect(generateSSONonce()).toBe('nonce-abc')
  })

  it('getSSOAuthorizationUrl — авт. инициализация и URL со state/nonce', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    const { getSSOAuthorizationUrl } = await import('../auth/oidc.js')
    const url = await getSSOAuthorizationUrl('state-abc', 'nonce-abc')
    expect(url).toBe('https://idp.test/auth?code=h')
    expect(clientInst.authorizationUrl).toHaveBeenCalledWith({
      scope: 'openid email profile',
      state: 'state-abc',
      nonce: 'nonce-abc',
    })
  })

  it('handleSSOCallback — авто-провижининг нового пользователя + токены + refresh в БД', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    prismaMock.employees.findFirst.mockResolvedValue(null)
    prismaMock.employees.create.mockResolvedValue({ id: 11, name: 'Иван', email: 'sso@company.ru', role: 'agent' })
    prismaMock.refresh_tokens.create.mockResolvedValue({ id: 1 })
    jwtCjs.default.sign.mockImplementation((payload) => `token_${payload.userId}`)
    const { handleSSOCallback } = await import('../auth/oidc.js')
    const result = await handleSSOCallback('code', 'state-abc', 'nonce-abc')
    expect(prismaMock.employees.create).toHaveBeenCalledTimes(1)
    expect(bcryptCjs.default.hash).toHaveBeenCalled()
    expect(jwtCjs.default.sign).toHaveBeenCalledTimes(2)
    expect(prismaMock.refresh_tokens.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ family_id: expect.any(String) }),
    })
    expect(result.employee.email).toBe('sso@company.ru')
  })

  it('handleSSOCallback — существующий пользователь без провижининга', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    prismaMock.employees.findFirst.mockResolvedValue({ id: 5, email: 'sso@company.ru', name: 'Иван', role: 'admin', is_active: true })
    prismaMock.refresh_tokens.create.mockResolvedValue({ id: 1 })
    const { handleSSOCallback } = await import('../auth/oidc.js')
    const result = await handleSSOCallback('code', 's', 'n')
    expect(prismaMock.employees.create).not.toHaveBeenCalled()
    expect(result.employee.id).toBe(5)
  })

  it('handleSSOCallback — отключённый аккаунт → Error', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    prismaMock.employees.findFirst.mockResolvedValue({ id: 5, email: 'sso@company.ru', name: 'Иван', role: 'agent', is_active: false })
    const { handleSSOCallback } = await import('../auth/oidc.js')
    await expect(handleSSOCallback('code', 's', 'n')).rejects.toThrow('Account is disabled')
  })

  it('handleSSOCallback — нет email в claims → Error', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue(SSO_ROWS)
    clientInst.callback = vi.fn().mockResolvedValue({ claims: () => ({ name: 'No Mail' }) })
    const { handleSSOCallback } = await import('../auth/oidc.js')
    await expect(handleSSOCallback('code', 's', 'n')).rejects.toThrow('No email in SSO claims')
  })

  it('handleSSOCallback — SSO не настроен → Error', async () => {
    prismaMock.admin_settings.findMany.mockResolvedValue([])
    const { handleSSOCallback } = await import('../auth/oidc.js')
    await expect(handleSSOCallback('code', 's', 'n')).rejects.toThrow('SSO not configured')
  })
})