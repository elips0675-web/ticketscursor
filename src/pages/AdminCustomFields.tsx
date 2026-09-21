import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Plus, Save, Loader2, Trash2, GripVertical, Settings2 } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface FieldDefinition {
  id: number
  name: string
  type: string
  options: string[] | null
  required: boolean
  enabled: boolean
  category: string
  sort_order: number
  created_at: string
  updated_at: string
}

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'textarea', 'checkbox']
const CATEGORIES = ['general', 'support', 'billing', 'technical']

export default function AdminCustomFields() {
  const { t } = useTranslation()
  const [fields, setFields] = useState<FieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newField, setNewField] = useState({ name: '', type: 'text', category: 'general', required: false })
  const [newOptions, setNewOptions] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editField, setEditField] = useState({
    name: '',
    type: 'text',
    category: 'general',
    required: false,
    enabled: true,
  })
  const [editOptions, setEditOptions] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/custom-fields')
      setFields(data || [])
    } catch {
      /* ignore */
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!newField.name.trim()) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = { ...newField }
      if (newField.type === 'select') {
        body.options = newOptions
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      }
      await api.post('/admin/custom-fields', body)
      toast.success('Field created')
      setNewField({ name: '', type: 'text', category: 'general', required: false })
      setNewOptions('')
      await load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      toast.error(message)
    }
    setCreating(false)
  }

  const startEdit = (f: FieldDefinition) => {
    setEditingId(f.id)
    setEditField({ name: f.name, type: f.type, category: f.category, required: f.required, enabled: f.enabled })
    setEditOptions(f.options?.join(', ') || '')
  }

  const save = async (id: number) => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { ...editField }
      if (editField.type === 'select') {
        body.options = editOptions
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      }
      await api.put(`/admin/custom-fields/${id}`, body)
      toast.success('Field updated')
      setEditingId(null)
      await load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      toast.error(message)
    }
    setSaving(false)
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this field? Existing ticket values will be lost.')) return
    try {
      await api.del(`/admin/custom-fields/${id}`)
      toast.success('Field deleted')
      await load()
    } catch {
      toast.error('Failed to delete field')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Custom Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.id} className="border rounded-lg p-3">
                  {editingId === f.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={editField.name}
                          onChange={(e) => setEditField((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Field name"
                          className="flex-1"
                        />
                        <select
                          value={editField.type}
                          onChange={(e) => setEditField((p) => ({ ...p, type: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <select
                          value={editField.category}
                          onChange={(e) => setEditField((p) => ({ ...p, category: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      {editField.type === 'select' && (
                        <Input
                          value={editOptions}
                          onChange={(e) => setEditOptions(e.target.value)}
                          placeholder="Options (comma separated)"
                        />
                      )}
                      <div className="flex gap-4 items-center">
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={editField.required}
                            onChange={(e) => setEditField((p) => ({ ...p, required: e.target.checked }))}
                          />{' '}
                          Required
                        </label>
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={editField.enabled}
                            onChange={(e) => setEditField((p) => ({ ...p, enabled: e.target.checked }))}
                          />{' '}
                          Enabled
                        </label>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => save(f.id)} disabled={saving}>
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{f.name}</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{f.type}</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{f.category}</span>
                      {f.required && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">required</span>
                      )}
                      {!f.enabled && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">disabled</span>
                      )}
                      {f.options && f.type === 'select' && (
                        <span className="text-xs text-muted-foreground">[{f.options.join(', ')}]</span>
                      )}
                      <div className="flex-1" />
                      <Button size="sm" variant="ghost" onClick={() => startEdit(f)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {fields.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No custom fields defined. Create one below.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add New Field</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newField.name}
              onChange={(e) => setNewField((p) => ({ ...p, name: e.target.value }))}
              placeholder="Field name"
              className="flex-1"
            />
            <select
              value={newField.type}
              onChange={(e) => setNewField((p) => ({ ...p, type: e.target.value }))}
              className="border rounded px-2 py-1 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={newField.category}
              onChange={(e) => setNewField((p) => ({ ...p, category: e.target.value }))}
              className="border rounded px-2 py-1 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {newField.type === 'select' && (
            <Input
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              placeholder="Options (comma separated)"
            />
          )}
          <div className="flex gap-4 items-center">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={newField.required}
                onChange={(e) => setNewField((p) => ({ ...p, required: e.target.checked }))}
              />{' '}
              Required
            </label>
            <div className="flex-1" />
            <Button onClick={create} disabled={creating || !newField.name.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Field
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
