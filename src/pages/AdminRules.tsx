import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Trash2, Zap, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '@/lib/api'

interface Rule {
  id: number
  name: string
  trigger_event: string
  conditions: { logic: string; rules: { field: string; operator: string; value: string }[] }
  actions: { type: string; params: Record<string, string> }[]
  is_active: boolean
  run_count: number
  last_run: string | null
  created_at: string | null
}

const TRIGGERS = [
  { value: 'ticket.created', label: 'Тикет создан' },
  { value: 'ticket.updated', label: 'Тикет обновлён' },
  { value: 'ticket.message', label: 'Новое сообщение' },
  { value: 'ticket.assigned', label: 'Тикет назначен' },
  { value: 'ticket.closed', label: 'Тикет закрыт' },
]

const ACTIONS = [
  { value: 'set_priority', label: 'Установить приоритет', params: ['priority'] },
  { value: 'set_status', label: 'Установить статус', params: ['status'] },
  { value: 'assign_to', label: 'Назначить сотрудника', params: ['employeeId'] },
  { value: 'add_tag', label: 'Добавить тег', params: ['tag'] },
  { value: 'send_notification', label: 'Отправить уведомление', params: ['message'] },
]

const OPERATORS = [
  { value: 'equals', label: 'равно' },
  { value: 'not_equals', label: 'не равно' },
  { value: 'contains', label: 'содержит' },
  { value: 'gt', label: 'больше' },
  { value: 'lt', label: 'меньше' },
  { value: 'in', label: 'в списке' },
  { value: 'is_empty', label: 'пусто' },
  { value: 'is_not_empty', label: 'не пусто' },
]

export function RulesSection() {
  const { t } = useTranslation()
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{
    name: string
    trigger_event: string
    conditions: { logic: string; rules: { field: string; operator: string; value: string }[] }
    actions: { type: string; params: Record<string, string> }[]
  }>({
    name: '',
    trigger_event: 'ticket.created',
    conditions: { logic: 'and', rules: [{ field: '', operator: 'equals', value: '' }] },
    actions: [{ type: 'set_priority', params: { priority: 'high' } }],
  })

  useEffect(() => {
    api
      .get('/rules')
      .then((d: Rule[]) => {
        setRules(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const addCondition = () => {
    setForm((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        rules: [...prev.conditions.rules, { field: '', operator: 'equals', value: '' }],
      },
    }))
  }

  const removeCondition = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        rules: prev.conditions.rules.filter((_, i) => i !== idx),
      },
    }))
  }

  const updateCondition = (idx: number, key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        rules: prev.conditions.rules.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
      },
    }))
  }

  const addAction = () => {
    setForm((prev) => ({
      ...prev,
      actions: [...prev.actions, { type: 'send_notification', params: { message: '' } }],
    }))
  }

  const removeAction = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== idx),
    }))
  }

  const createAction = async () => {
    if (!form.name.trim() || !form.trigger_event) return
    setSaving(true)
    try {
      const rule = await api.post('/rules', form)
      setRules((prev) => [rule, ...prev])
      setForm({
        name: '',
        trigger_event: 'ticket.created',
        conditions: { logic: 'and', rules: [{ field: '', operator: 'equals', value: '' }] },
        actions: [{ type: 'set_priority', params: { priority: 'high' } }],
      })
      setShowForm(false)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('common.error'))
    }
    setSaving(false)
  }

  const toggleActive = async (rule: Rule) => {
    try {
      await api.put(`/rules/${rule.id}`, { is_active: !rule.is_active })
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return
    try {
      await api.delete(`/rules/${id}`)
      setRules((prev) => prev.filter((r) => r.id !== id))
    } catch {
      toast.error(t('common.error'))
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            {t('admin.rules')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          {t('admin.rules')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admin.rulesSubtitle')}</p>

        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
          <Plus className="w-3 h-3" />
          {showForm ? t('common.cancel') : t('admin.ruleCreate')}
        </Button>

        {showForm && (
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <Label className="text-xs font-bold">{t('admin.ruleName')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1"
                placeholder="Автоприоритет для критических"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">{t('admin.ruleTrigger')}</Label>
              <select
                value={form.trigger_event}
                onChange={(e) => setForm((p) => ({ ...p, trigger_event: e.target.value }))}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TRIGGERS.map((tr) => (
                  <option key={tr.value} value={tr.value}>
                    {tr.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold">{t('admin.ruleConditions')}</Label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.conditions.logic}
                    onChange={(e) => setForm((p) => ({ ...p, conditions: { ...p.conditions, logic: e.target.value } }))}
                    className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="and">И</option>
                    <option value="or">ИЛИ</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={addCondition} className="h-7 text-xs">
                    + Добавить
                  </Button>
                </div>
              </div>
              {form.conditions.rules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <Input
                    value={rule.field}
                    onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                    className="flex-1"
                    placeholder="field (status, priority, category)"
                  />
                  <select
                    value={rule.operator}
                    onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={rule.value}
                    onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                    className="flex-1"
                    placeholder="value"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeCondition(idx)}
                    className="shrink-0 text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold">{t('admin.ruleActions')}</Label>
                <Button size="sm" variant="ghost" onClick={addAction} className="h-7 text-xs">
                  + Добавить
                </Button>
              </div>
              {form.actions.map((action, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <select
                    value={action.type}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        actions: p.actions.map((a, i) => (i === idx ? { ...a, type: e.target.value, params: {} } : a)),
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {ACTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  {action.type === 'set_priority' && (
                    <select
                      value={action.params.priority || 'high'}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          actions: p.actions.map((a, i) =>
                            i === idx ? { ...a, params: { ...a.params, priority: e.target.value } } : a,
                          ),
                        }))
                      }
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  )}
                  {action.type === 'set_status' && (
                    <select
                      value={action.params.status || 'open'}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          actions: p.actions.map((a, i) =>
                            i === idx ? { ...a, params: { ...a.params, status: e.target.value } } : a,
                          ),
                        }))
                      }
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  )}
                  {(action.type === 'add_tag' ||
                    action.type === 'send_notification' ||
                    action.type === 'assign_to') && (
                    <Input
                      value={action.params.tag || action.params.message || action.params.employeeId || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          actions: p.actions.map((a, i) =>
                            i === idx
                              ? {
                                  ...a,
                                  params: {
                                    ...a.params,
                                    [action.type === 'add_tag'
                                      ? 'tag'
                                      : action.type === 'send_notification'
                                        ? 'message'
                                        : 'employeeId']: e.target.value,
                                  },
                                }
                              : a,
                          ),
                        }))
                      }
                      className="flex-1"
                      placeholder={
                        action.type === 'add_tag'
                          ? 'tag name'
                          : action.type === 'send_notification'
                            ? 'message template'
                            : 'employee ID'
                      }
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeAction(idx)}
                    className="shrink-0 text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <Button size="sm" onClick={createAction} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {t('common.save')}
            </Button>
          </div>
        )}

        {rules.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('admin.rulesEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-lg border px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {rule.is_active ? (
                      <ToggleRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{rule.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(rule)} className="text-xs h-7">
                      {rule.is_active ? t('common.disable') : t('common.enable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(rule.id)}
                      className="text-destructive hover:text-destructive h-7"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>TRIGGER: {rule.trigger_event}</span>
                  <span>· RUNS: {rule.run_count}</span>
                  {rule.last_run && <span>· LAST: {new Date(rule.last_run).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
