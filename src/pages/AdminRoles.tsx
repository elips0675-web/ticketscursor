import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { KeyRound, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, Wand2 } from 'lucide-react'
import { api } from '@/lib/api'

interface PermissionDefinition {
  key: string
  label: string
  defaultRoles: string[]
}

interface CustomRole {
  id: number
  name: string
  description: string
  base_role: string
  permissions: string[]
}

interface RoleForm {
  name: string
  description: string
  base_role: string
  permissions: string[]
}

const BASE_ROLES = ['agent', 'senior_agent', 'admin']
const EMPTY_FORM: RoleForm = { name: '', description: '', base_role: 'agent', permissions: [] }

function permissionLabelKey(key: string): string {
  return `admin.perm_${key.replace(/\./g, '_')}`
}

export default function AdminRoles() {
  const { t } = useTranslation()
  const [roles, setRoles] = useState<CustomRole[]>([])
  const [catalog, setCatalog] = useState<PermissionDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<RoleForm | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [roleData, catalogData] = await Promise.all([
        api.get<CustomRole[]>('/admin/roles'),
        api.get<PermissionDefinition[]>('/admin/permissions'),
      ])
      setRoles(roleData ?? [])
      setCatalog(catalogData ?? [])
    } catch {
      setRoles([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])

  const defaultsFor = useCallback(
    (baseRole: string) => catalog.filter((p) => p.defaultRoles.includes(baseRole)).map((p) => p.key),
    [catalog],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, permissions: defaultsFor('agent') })
  }

  const openEdit = (role: CustomRole) => {
    setEditingId(role.id)
    setForm({
      name: role.name,
      description: role.description,
      base_role: role.base_role,
      permissions: [...role.permissions],
    })
  }

  const closeForm = () => {
    setForm(null)
    setEditingId(null)
  }

  const togglePermission = (key: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            permissions: prev.permissions.includes(key)
              ? prev.permissions.filter((p) => p !== key)
              : [...prev.permissions, key],
          }
        : prev,
    )
  }

  const applyTemplate = () => {
    setForm((prev) => (prev ? { ...prev, permissions: defaultsFor(prev.base_role) } : prev))
  }

  const save = async () => {
    if (!form) return
    if (!form.name.trim()) {
      toast.error(t('admin.rolesNameRequired'))
      return
    }
    setSaving(true)
    try {
      if (editingId === null) {
        await api.post('/admin/roles', form)
      } else {
        await api.put(`/admin/roles/${editingId}`, form)
      }
      toast.success(t('admin.rolesSaved'))
      closeForm()
      await fetchAll()
    } catch {
      // api уже показал сообщение сервера
    }
    setSaving(false)
  }

  const remove = async (role: CustomRole) => {
    if (!window.confirm(t('admin.rolesDeleteConfirm', { name: role.name }))) return
    try {
      await api.delete(`/admin/roles/${role.id}`)
      toast.success(t('admin.rolesDeleted'))
      await fetchAll()
    } catch {
      // api уже показал сообщение сервера
    }
  }

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionDefinition[]>()
    for (const permission of catalog) {
      const group = permission.key.split('.')[0]
      groups.set(group, [...(groups.get(group) ?? []), permission])
    }
    return [...groups.entries()]
  }, [catalog])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.roles')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('admin.rolesSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {t('admin.refresh')}
          </Button>
          <Button size="sm" onClick={openCreate} data-testid="role-create">
            <Plus className="w-4 h-4 mr-1.5" />
            {t('admin.rolesAdd')}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{t('admin.rolesNote')}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('admin.rolesEmpty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="roles-list">
          {roles.map((role) => (
            <Card key={role.id} data-testid={`role-${role.id}`}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-primary" />
                    {role.name}
                    <Badge variant="secondary" className="text-[10px]">
                      {role.base_role}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => openEdit(role)}
                      aria-label={t('admin.rolesEdit')}
                      data-testid={`role-edit-${role.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      {t('admin.rolesEdit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive"
                      onClick={() => remove(role)}
                      aria-label={t('admin.rolesDelete')}
                      data-testid={`role-delete-${role.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t('admin.rolesNoPermissions')}</span>
                  ) : (
                    role.permissions.map((permission) => (
                      <Badge key={permission} variant="outline" className="text-[10px] font-mono">
                        {t(permissionLabelKey(permission))}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            data-testid="role-form"
          >
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold">
                {editingId === null ? t('admin.rolesAdd') : t('admin.rolesEdit')}
              </h2>

              <div>
                <label className="text-sm font-medium mb-1 block" htmlFor="role-name">
                  {t('admin.rolesName')}
                </label>
                <input
                  id="role-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block" htmlFor="role-description">
                  {t('admin.rolesDescription')}
                </label>
                <input
                  id="role-description"
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block" htmlFor="role-base">
                    {t('admin.rolesBase')}
                  </label>
                  <select
                    id="role-base"
                    value={form.base_role}
                    onChange={(e) => setForm({ ...form, base_role: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {BASE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="outline" size="sm" onClick={applyTemplate} data-testid="role-apply-template">
                  <Wand2 className="w-3.5 h-3.5 mr-1" />
                  {t('admin.rolesApplyTemplate')}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">{t('admin.rolesBaseHint')}</p>

              <div className="space-y-3">
                <p className="text-sm font-medium">{t('admin.rolesPermissions')}</p>
                {groupedPermissions.map(([group, permissions]) => (
                  <div key={group} className="rounded-md border p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-bold">
                      {group}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {permissions.map((permission) => (
                        <label
                          key={permission.key}
                          className="flex items-center gap-2 text-xs cursor-pointer"
                          htmlFor={`perm-${permission.key}`}
                        >
                          <input
                            id={`perm-${permission.key}`}
                            type="checkbox"
                            checked={form.permissions.includes(permission.key)}
                            onChange={() => togglePermission(permission.key)}
                            data-testid={`perm-check-${permission.key}`}
                          />
                          {t(permissionLabelKey(permission.key))}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeForm} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={save} disabled={saving} data-testid="role-save">
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
