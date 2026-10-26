import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app, server } from '../app.js'
import prisma from '../prisma.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateFeatureFlagCache } from '../feature-flags.js'
import {
  PERMISSION_KEYS,
  createRole,
  updateRole,
  deleteRole,
  listRoles,
  getRoleById,
  validatePermissions,
  resolvePermissions,
  loadUserPermissions,
  requirePermission,
  defaultPermissionsFor,
  getPermissionCatalog,
  toRoleDto,
} from '../custom-roles.js'

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const roleName = `customroles_${suffix}`
const email = `customroles_${suffix}@example.com`
const restrictedEmail = `customroles_restricted_${suffix}@example.com`
let devToken
let restrictedToken
let restrictedEmployee
let restrictedRole

function mockReqRes(user) {
  return {
    req: { user },
    res: { status: vi.fn().mockReturnThis(), json: vi.fn() },
    next: vi.fn(),
  }
}

async function setFlag(enabled) {
  await prisma.feature_flags.update({ where: { key: 'custom_roles' }, data: { enabled } })
  invalidateFeatureFlagCache()
}

beforeAll(async () => {
  server.listen(4002)
  const res = await request(app).post('/api/auth/dev-login')
  devToken = res.body.data.token

  await setFlag(false)

  restrictedRole = await createRole({
    name: `${roleName}_restricted`,
    description: 'Только журнал аудита',
    base_role: 'admin',
    permissions: ['audit.view'],
  })
  restrictedEmployee = await prisma.employees.create({
    data: {
      name: 'Restricted Admin',
      email: restrictedEmail,
      password_hash: 'x',
      role: 'admin',
      custom_role_id: restrictedRole.id,
    },
  })
  restrictedToken = jwt.sign({ userId: restrictedEmployee.id, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
})

afterAll(async () => {
  if (restrictedEmployee) await prisma.employees.delete({ where: { id: restrictedEmployee.id } }).catch(() => {})
  await prisma.custom_roles.deleteMany({ where: { name: { startsWith: roleName } } })
  await setFlag(false)
  server.close()
})

describe('custom roles — валидация и каталог', () => {
  it('каталог содержит все права RBAC с ключом и меткой', () => {
    const catalog = getPermissionCatalog()
    expect(catalog).toHaveLength(PERMISSION_KEYS.length)
    for (const item of catalog) {
      expect(item.key).toMatch(/^[a-z_]+\.[a-z_]+$/)
      expect(item.label.length).toBeGreaterThan(0)
      expect(Array.isArray(item.defaultRoles)).toBe(true)
    }
  })

  it('неизвестное право отклоняется с 400', () => {
    expect(() => validatePermissions(['tickets.view', 'nope.nope'])).toThrowError(/Unknown permission/)
    try {
      validatePermissions(['nope.nope'])
    } catch (err) {
      expect(err.statusCode).toBe(400)
    }
  })

  it('дубли и пустые строки в правах схлопываются', () => {
    expect(validatePermissions([' tickets.view ', 'tickets.view', ''])).toEqual(['tickets.view'])
  })

  it('permissions не массив — 400', () => {
    expect(() => validatePermissions('tickets.view')).toThrowError(/must be an array/)
  })

  it('undefined означает «права не переданы»', () => {
    expect(validatePermissions(undefined)).toBeUndefined()
  })

  it('шаблон base_role заполняет права своей роли', () => {
    expect(defaultPermissionsFor('agent')).toContain('tickets.create')
    expect(defaultPermissionsFor('agent')).not.toContain('settings.manage')
    expect(defaultPermissionsFor('admin')).toContain('settings.manage')
    expect(defaultPermissionsFor('admin')).not.toContain('super.admin')
  })
})

describe('custom roles — разрешение прав', () => {
  it('super_admin получает все права и не ограничивается ролью', () => {
    const resolved = resolvePermissions('super_admin', { permissions: [] })
    expect(resolved.size).toBe(PERMISSION_KEYS.length)
  })

  it('без custom role действуют дефолты роли из иерархии', () => {
    const resolved = resolvePermissions('agent', null)
    expect(resolved.has('tickets.view')).toBe(true)
    expect(resolved.has('settings.manage')).toBe(false)
  })

  it('custom role заменяет набор прав, а не дополняет его', () => {
    const resolved = resolvePermissions('admin', { permissions: ['audit.view'] })
    expect([...resolved]).toEqual(['audit.view'])
    expect(resolved.has('settings.manage')).toBe(false)
  })

  it('неизвестные права из строки БД игнорируются', () => {
    const resolved = resolvePermissions('agent', { custom_role_permissions: [{ permission: 'audit.view' }, { permission: 'gone.gone' }] })
    expect([...resolved]).toEqual(['audit.view'])
  })

  it('toRoleDto отдаёт права отсортированными', () => {
    const dto = toRoleDto({
      id: 1,
      name: 'R',
      description: 'd',
      base_role: 'agent',
      custom_role_permissions: [{ permission: 'tickets.view' }, { permission: 'audit.view' }],
    })
    expect(dto.permissions).toEqual(['audit.view', 'tickets.view'])
  })

  it('без идентификатора возвращает дефолты роли', async () => {
    const permissions = await loadUserPermissions(undefined, 'agent')
    expect(permissions.has('tickets.view')).toBe(true)
  })
})

describe('custom roles — CRUD в реальной БД', () => {
  let role

  it('создаёт роль с явным набором прав', async () => {
    role = await createRole({
      name: roleName,
      description: 'Проверка CRUD',
      base_role: 'agent',
      permissions: ['tickets.view', 'audit.view'],
    })
    expect(role.id).toBeGreaterThan(0)
    expect(role.permissions).toEqual(['audit.view', 'tickets.view'])

    const found = await getRoleById(role.id)
    expect(found.name).toBe(roleName)
    const all = await listRoles()
    expect(all.some((r) => r.id === role.id)).toBe(true)
  })

  it('дубликат имени — 409', async () => {
    await expect(createRole({ name: roleName, permissions: [] })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('без permissions берёт шаблон base_role', async () => {
    const templated = await createRole({ name: `${roleName}_admin`, base_role: 'admin' })
    expect(templated.permissions).toContain('settings.manage')
    expect(templated.permissions).not.toContain('super.admin')
    await deleteRole(templated.id)
  })

  it('неизвестный base_role — 400', async () => {
    await expect(createRole({ name: `${roleName}_bad`, base_role: 'root' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('обновление заменяет набор прав и имя', async () => {
    const updated = await updateRole(role.id, { name: `${roleName}_v2`, permissions: ['tickets.comment'] })
    expect(updated.name).toBe(`${roleName}_v2`)
    expect(updated.permissions).toEqual(['tickets.comment'])
  })

  it('пустой массив снимает все права', async () => {
    const updated = await updateRole(role.id, { permissions: [] })
    expect(updated.permissions).toEqual([])
  })

  it('неизвестное право при обновлении — 400', async () => {
    await expect(updateRole(role.id, { permissions: ['nope.nope'] })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('обновление без полей — 400', async () => {
    await expect(updateRole(role.id, {})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('несуществующая роль при обновлении — null', async () => {
    expect(await updateRole(99999999, { name: 'nonexistent_role' })).toBeNull()
  })

  it('удаление: true, повторное удаление — false', async () => {
    expect(await deleteRole(role.id)).toBe(true)
    expect(await deleteRole(role.id)).toBe(false)
  })
})

describe('custom roles — права сотрудника', () => {
  let employee
  let role

  beforeAll(async () => {
    role = await createRole({
      name: `${roleName}_employee`,
      base_role: 'agent',
      permissions: ['tickets.view', 'tickets.comment'],
    })
    employee = await prisma.employees.create({
      data: { name: 'Role User', email, password_hash: 'x', role: 'agent' },
    })
  })

  afterAll(async () => {
    if (employee) await prisma.employees.delete({ where: { id: employee.id } }).catch(() => {})
    if (role) await deleteRole(role.id).catch(() => {})
  })

  it('без custom role — дефолты роли', async () => {
    const permissions = await loadUserPermissions(employee.id, 'agent')
    expect(permissions.has('tickets.view')).toBe(true)
    expect(permissions.has('audit.view')).toBe(false)
  })

  it('с custom role — ровно её набор', async () => {
    await prisma.employees.update({ where: { id: employee.id }, data: { custom_role_id: role.id } })
    const permissions = await loadUserPermissions(employee.id, 'agent')
    expect([...permissions].sort()).toEqual(['tickets.comment', 'tickets.view'])
  })
})

describe('custom roles — requirePermission middleware', () => {
  it('без req.user — 403', async () => {
    const { req, res, next } = mockReqRes(null)
    await requirePermission('settings.manage')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('урезанная custom role не проходит settings.manage', async () => {
    const { req, res, next } = mockReqRes({ userId: restrictedEmployee.id, role: 'admin' })
    await requirePermission('settings.manage')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PERMISSION_DENIED', permission: 'settings.manage' }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('право из custom role пропускает', async () => {
    const { req, res, next } = mockReqRes({ userId: restrictedEmployee.id, role: 'admin' })
    await requirePermission('audit.view')(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})

describe('custom roles — HTTP-роуты', () => {
  let createdId

  it('при выключенном флаге роут отвечает 404', async () => {
    await setFlag(false)
    const res = await request(app).get('/api/admin/roles').set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(404)
  })

  it('без токена — 401', async () => {
    const res = await request(app).get('/api/admin/roles')
    expect(res.status).toBe(401)
  })

  it('агент не проходит гейт админки — 403', async () => {
    const agentToken = jwt.sign({ userId: 999, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app).get('/api/admin/roles').set('Authorization', `Bearer ${agentToken}`)
    expect(res.status).toBe(403)
  })

  it('флаг включён: каталог и список доступны', async () => {
    await setFlag(true)
    const catalog = await request(app).get('/api/admin/permissions').set('Authorization', `Bearer ${devToken}`)
    expect(catalog.status).toBe(200)
    expect(catalog.body.data.length).toBe(PERMISSION_KEYS.length)

    const list = await request(app).get('/api/admin/roles').set('Authorization', `Bearer ${devToken}`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.data)).toBe(true)
  })

  it('создаёт роль через POST', async () => {
    const res = await request(app)
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: `${roleName}_http`, description: 'HTTP', base_role: 'agent', permissions: ['tickets.view'] })
    expect(res.status).toBe(201)
    expect(res.body.data.permissions).toEqual(['tickets.view'])
    createdId = res.body.data.id
  })

  it('дубликат имени — 409', async () => {
    const res = await request(app)
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: `${roleName}_http`, permissions: [] })
    expect(res.status).toBe(409)
  })

  it('неизвестное право — 400', async () => {
    const res = await request(app)
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: `${roleName}_http_bad`, permissions: ['nope.nope'] })
    expect(res.status).toBe(400)
  })

  it('обновляет роль через PUT', async () => {
    const res = await request(app)
      .put(`/api/admin/roles/${createdId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ permissions: ['audit.view'] })
    expect(res.status).toBe(200)
    expect(res.body.data.permissions).toEqual(['audit.view'])
  })

  it('несуществующая роль — 404', async () => {
    const res = await request(app)
      .put('/api/admin/roles/99999999')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'nonexistent_role' })
    expect(res.status).toBe(404)
  })

  it('админ с урезанной custom role получает 403 на управление ролями', async () => {
    const res = await request(app)
      .get('/api/admin/roles')
      .set('Authorization', `Bearer ${restrictedToken}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PERMISSION_DENIED')
  })

  it('после выдачи settings.manage тот же админ проходит', async () => {
    await updateRole(restrictedRole.id, { permissions: ['audit.view', 'settings.manage'] })
    const res = await request(app)
      .get('/api/admin/roles')
      .set('Authorization', `Bearer ${restrictedToken}`)
    expect(res.status).toBe(200)
  })

  it('удаляет роль через DELETE и затем отдаёт 404', async () => {
    const first = await request(app)
      .delete(`/api/admin/roles/${createdId}`)
      .set('Authorization', `Bearer ${devToken}`)
    expect(first.status).toBe(200)
    expect(first.body.data.deleted).toBe(true)

    const second = await request(app)
      .delete(`/api/admin/roles/${createdId}`)
      .set('Authorization', `Bearer ${devToken}`)
    expect(second.status).toBe(404)
  })
})

describe('custom roles — управление пользователями', () => {
  let role
  let employee

  beforeAll(async () => {
    await setFlag(true)
    role = await createRole({ name: `${roleName}_assign`, base_role: 'agent', permissions: ['tickets.view'] })
    employee = await prisma.employees.create({
      data: { name: 'Assign User', email: `customroles_assign_${suffix}@example.com`, password_hash: 'x', role: 'agent' },
    })
  })

  afterAll(async () => {
    if (employee) await prisma.employees.delete({ where: { id: employee.id } }).catch(() => {})
    if (role) await deleteRole(role.id).catch(() => {})
  })

  it('GET /users отдаёт customRoleId и имя роли', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${devToken}`)
    expect(res.status).toBe(200)
    const row = res.body.data.find((u) => u.id === employee.id)
    expect(row).toHaveProperty('customRoleId', null)
  })

  it('PUT /users/:id назначает и снимает custom role', async () => {
    const assign = await request(app)
      .put(`/api/admin/users/${employee.id}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ customRoleId: role.id })
    expect(assign.status).toBe(200)

    const withRole = await prisma.employees.findUnique({ where: { id: employee.id } })
    expect(withRole.custom_role_id).toBe(role.id)

    const reset = await request(app)
      .put(`/api/admin/users/${employee.id}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ customRoleId: null })
    expect(reset.status).toBe(200)
    const withoutRole = await prisma.employees.findUnique({ where: { id: employee.id } })
    expect(withoutRole.custom_role_id).toBeNull()
  })

  it('неизвестная custom role — 400', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${employee.id}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ customRoleId: 99999999 })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Unknown custom role')
  })

  it('смена роли сбрасывает custom role', async () => {
    await prisma.employees.update({ where: { id: employee.id }, data: { custom_role_id: role.id } })
    const res = await request(app)
      .put(`/api/admin/users/${employee.id}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ role: 'agent' })
    expect(res.status).toBe(200)
    const row = await prisma.employees.findUnique({ where: { id: employee.id } })
    expect(row.custom_role_id).toBeNull()
  })
})
