// Этап 68: auth/ldap.js — 0% → юнит-тесты authenticateLDAP.
// Покрыты: валидация, «не настроен», ошибки bind/search, не-найденный пользователь,
// авто-провижининг, подпись JWT, ошибка БД.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import jwt from 'jsonwebtoken'

vi.mock('ldapjs', () => ({ default: { createClient: vi.fn() } }))

vi.mock('../prisma.js', () => ({
  default: {
    employees: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('../settings.js', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
}))

vi.mock('../middleware.js', () => ({
  JWT_SECRET: 'test-secret-key-12345',
  authenticateToken: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import ldapjs from 'ldapjs'
const { createClient } = ldapjs
import prisma from '../prisma.js'
import { getSettings } from '../settings.js'
import { JWT_SECRET } from '../middleware.js'
import { authenticateLDAP } from '../auth/ldap.js'

describe('auth/ldap.js — authenticateLDAP (Этап 68)', () => {
  let res

  beforeEach(() => {
    vi.clearAllMocks()
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    getSettings.mockResolvedValue({
      LDAP_URL: 'ldap://ldap.test:389',
      LDAP_BASE_DN: 'dc=test,dc=ru',
      LDAP_BIND_DN: '',
      LDAP_BIND_CREDENTIALS: '',
    })
  })

  function mockClient({ bindErr = null, searchErr = null, emitter } = {}) {
    const client = {
      bind: vi.fn((_dn, _pass, cb) => cb(bindErr)),
      search: vi.fn((_base, _opts, cb) => cb(searchErr, emitter)),
      unbind: vi.fn(),
    }
    createClient.mockReturnValue(client)
    return client
  }

  // LDAP-хендлер регистрирует обработчики search-респонса после await getSettings(),
  // поэтому перед emit нужно дождаться одной микротаски.
  const flush = () => Promise.resolve()

  it('400 без username/password', async () => {
    await authenticateLDAP({ body: {} }, res)
    await authenticateLDAP({ body: { username: 'ivan' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('503, когда LDAP не настроен', async () => {
    getSettings.mockResolvedValue({})
    delete process.env.LDAP_URL
    delete process.env.LDAP_BASE_DN
    await authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('401 при ошибке bind', async () => {
    mockClient({ bindErr: new Error('InvalidCredentials') })
    await authenticateLDAP({ body: { username: 'ivan', password: 'bad' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'LDAP authentication failed' })
  })

  it('500 при ошибке search', async () => {
    mockClient({ searchErr: new Error('no such object') })
    await authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('401, если запись пользователя не найдена', async () => {
    const emitter = new EventEmitter()
    mockClient({ emitter })
    const p = authenticateLDAP({ body: { username: 'nobody', password: 'pass' } }, res)
    await flush()
    emitter.emit('end')
    await p
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found in LDAP' })
  })

  it('200: существующий сотрудник — JWT подписывается с его ролью', async () => {
    const emitter = new EventEmitter()
    mockClient({ emitter })
    prisma.employees.findFirst.mockResolvedValue({ id: 7, name: 'Иван', email: 'ivan@test.ru', role: 'senior_agent' })

    const p = authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    await flush()
    emitter.emit('searchEntry', { object: { uid: 'ivan', cn: 'Иван', mail: 'ivan@test.ru' } })
    emitter.emit('end')
    await p

    expect(res.json).toHaveBeenCalled()
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    const decoded = jwt.verify(payload.data.token, JWT_SECRET)
    expect(decoded.userId).toBe(7)
    expect(decoded.role).toBe('senior_agent')
    expect(prisma.employees.create).not.toHaveBeenCalled()
  })

  it('200: авто-провижинг нового сотрудника (agent)', async () => {
    const emitter = new EventEmitter()
    mockClient({ emitter })
    prisma.employees.findFirst.mockResolvedValue(null)
    prisma.employees.create.mockResolvedValue({ id: 99, name: 'Иван', email: 'ivan@test.ru', role: 'agent' })

    const p = authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    await flush()
    emitter.emit('searchEntry', { object: { uid: 'ivan', cn: 'Иван' } })
    emitter.emit('end')
    await p

    expect(prisma.employees.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Иван', email: 'ivan@company.ru', role: 'agent', is_active: true }),
    })
    const payload = res.json.mock.calls[0][0]
    expect(payload.data.token).toBeTruthy()
  })

  it('email подставляется из username, если атрибут mail отсутствует', async () => {
    const emitter = new EventEmitter()
    mockClient({ emitter })
    prisma.employees.findFirst.mockResolvedValue({ id: 1, name: 'ivan', email: 'ivan@company.ru', role: 'agent' })

    const p = authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    await flush()
    emitter.emit('searchEntry', { object: { uid: 'ivan' } })
    emitter.emit('end')
    await p

    expect(prisma.employees.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ivan@company.ru', is_active: true } }),
    )
  })

  it('500 при ошибке БД', async () => {
    const emitter = new EventEmitter()
    mockClient({ emitter })
    prisma.employees.findFirst.mockRejectedValue(new Error('db down'))

    const p = authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    await flush()
    emitter.emit('searchEntry', { object: { uid: 'ivan', mail: 'ivan@test.ru' } })
    emitter.emit('end')
    await p

    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' })
  })

  it('500 по событию error search-респонса', async () => {
    const emitter = new EventEmitter()
    mockClient({ emitter })
    const p = authenticateLDAP({ body: { username: 'ivan', password: 'pass' } }, res)
    await flush()
    emitter.emit('error', new Error('stream failed'))
    await p
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: 'LDAP search error' })
  })
})