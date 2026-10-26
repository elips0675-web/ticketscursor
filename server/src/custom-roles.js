// Custom roles (Этап 66.5): именованный набор permissions, который выдаётся
// сотруднику через `employees.custom_role_id`.
//
// Семантика: если у сотрудника есть custom role, его действующие права — ровно
// её набор permissions (не объединение с дефолтами роли). Иначе роль из
// иерархии работает как раньше. super_admin не ограничивается никогда, иначе
// одна неверная настройка роли запирает администрирование.
//
// `base_role` — шаблон для конструктора: по нему заполняются чекбоксы и он
// показывается в списке ролей. Runtime-права читаются только из
// `custom_role_permissions`, иначе пустой набор было бы невозможно выразить.
import prisma from './prisma.js'
import { RBAC_PERMISSIONS } from './rbac.js'

export const CUSTOM_ROLE_BASE_ROLES = ['agent', 'senior_agent', 'admin']
export const PERMISSION_KEYS = RBAC_PERMISSIONS.map((p) => p.key)

const NAME_MIN = 2
const NAME_MAX = 100
const DESCRIPTION_MAX = 500

function httpError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

export function defaultPermissionsFor(baseRole) {
  return RBAC_PERMISSIONS.filter((p) => p.defaultRoles.includes(baseRole)).map((p) => p.key)
}

export function getPermissionCatalog() {
  return RBAC_PERMISSIONS.map((p) => ({ key: p.key, label: p.label, defaultRoles: [...p.defaultRoles] }))
}

function validateName(name) {
  if (typeof name !== 'string') throw httpError(400, 'name is required')
  const trimmed = name.trim()
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    throw httpError(400, `name must be ${NAME_MIN}-${NAME_MAX} characters`)
  }
  return trimmed
}

function validateDescription(description) {
  if (description === undefined) return undefined
  if (typeof description !== 'string') throw httpError(400, 'description must be a string')
  if (description.length > DESCRIPTION_MAX) {
    throw httpError(400, `description must be at most ${DESCRIPTION_MAX} characters`)
  }
  return description
}

function validateBaseRole(baseRole) {
  if (baseRole === undefined) return undefined
  if (!CUSTOM_ROLE_BASE_ROLES.includes(baseRole)) {
    throw httpError(400, `base_role must be one of: ${CUSTOM_ROLE_BASE_ROLES.join(', ')}`)
  }
  return baseRole
}

export function validatePermissions(permissions) {
  if (permissions === undefined) return undefined
  if (!Array.isArray(permissions)) throw httpError(400, 'permissions must be an array')
  const unique = [...new Set(permissions.map((p) => String(p).trim()).filter(Boolean))]
  const unknown = unique.filter((p) => !PERMISSION_KEYS.includes(p))
  if (unknown.length > 0) throw httpError(400, `Unknown permission: ${unknown.join(', ')}`)
  return unique
}

export function toRoleDto(row) {
  const permissions = (row.custom_role_permissions ?? []).map((p) => p.permission).sort()
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    base_role: row.base_role,
    permissions,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

export async function listRoles() {
  const rows = await prisma.custom_roles.findMany({
    orderBy: { name: 'asc' },
    include: { custom_role_permissions: true },
  })
  return rows.map(toRoleDto)
}

export async function getRoleById(id) {
  const row = await prisma.custom_roles.findUnique({
    where: { id },
    include: { custom_role_permissions: true },
  })
  return row ? toRoleDto(row) : null
}

export async function createRole(input = {}) {
  const name = validateName(input.name)
  const description = validateDescription(input.description) ?? ''
  const base_role = validateBaseRole(input.base_role) ?? 'agent'
  const permissions = validatePermissions(input.permissions) ?? defaultPermissionsFor(base_role)

  try {
    const row = await prisma.custom_roles.create({
      data: {
        name,
        description,
        base_role,
        custom_role_permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      include: { custom_role_permissions: true },
    })
    return toRoleDto(row)
  } catch (err) {
    if (err.code === 'P2002') throw httpError(409, 'Role with this name already exists')
    throw err
  }
}

export async function updateRole(id, input = {}) {
  const name = input.name === undefined ? undefined : validateName(input.name)
  const description = validateDescription(input.description)
  const base_role = validateBaseRole(input.base_role)
  const permissions = validatePermissions(input.permissions)

  const data = {}
  if (name !== undefined) data.name = name
  if (description !== undefined) data.description = description
  if (base_role !== undefined) data.base_role = base_role

  if (Object.keys(data).length === 0 && permissions === undefined) {
    throw httpError(400, 'No fields to update')
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.custom_roles.findUnique({ where: { id } })
      if (!existing) return null
      if (Object.keys(data).length > 0) {
        await tx.custom_roles.update({ where: { id }, data: { ...data, updated_at: new Date() } })
      }
      if (permissions !== undefined) {
        await tx.custom_role_permissions.deleteMany({ where: { role_id: id } })
        if (permissions.length > 0) {
          await tx.custom_role_permissions.createMany({
            data: permissions.map((permission) => ({ role_id: id, permission })),
          })
        }
      }
      const row = await tx.custom_roles.findUnique({
        where: { id },
        include: { custom_role_permissions: true },
      })
      return toRoleDto(row)
    })
  } catch (err) {
    if (err.code === 'P2002') throw httpError(409, 'Role with this name already exists')
    throw err
  }
}

export async function deleteRole(id) {
  try {
    await prisma.custom_roles.delete({ where: { id } })
    return true
  } catch (err) {
    if (err.code === 'P2025') return false
    throw err
  }
}

export function resolvePermissions(role, customRole = null) {
  if (role === 'super_admin') return new Set(PERMISSION_KEYS)
  if (customRole) {
    const granted = customRole.permissions ?? (customRole.custom_role_permissions ?? []).map((p) => p.permission)
    return new Set(granted.filter((p) => PERMISSION_KEYS.includes(p)))
  }
  return new Set(defaultPermissionsFor(role))
}

export async function loadUserPermissions(userId, role) {
  if (role === 'super_admin' || !userId) return resolvePermissions(role)
  const employee = await prisma.employees.findUnique({
    where: { id: userId },
    select: { custom_role_id: true, custom_roles: { include: { custom_role_permissions: true } } },
  })
  return resolvePermissions(role, employee?.custom_roles ?? null)
}

export async function hasPermission(user, permission) {
  if (!user) return false
  const permissions = await loadUserPermissions(user.userId, user.role)
  return permissions.has(permission)
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (await hasPermission(req.user, permission)) return next()
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        permission,
        message: `Forbidden: ${permission} required`,
      })
    } catch (err) {
      next(err)
    }
  }
}
