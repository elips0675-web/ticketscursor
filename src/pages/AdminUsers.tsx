import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

import { Users, RefreshCw, UserCheck, UserX, Upload, FileText, LogOut, Loader2 } from 'lucide-react'
import mammoth from 'mammoth'

interface User {
  id: number
  name: string
  email: string
  role: string
  department: string
  title: string
  online: boolean
  activeTickets: number
  resolvedToday: number
  isActive: boolean
  createdAt: string
}

export default function AdminUsers() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    skipped: number
    errors: { name: string; reason: string }[]
    defaultPassword: string
  } | null>(null)
  const [defaultPassword, setDefaultPassword] = useState('123456')
  const [revokingId, setRevokingId] = useState<number | null>(null)

  const unwrapApiData = <T,>(payload: T | { success?: boolean; data?: T } | null): T | null => {
    if (!payload) return null
    if (typeof payload === 'object' && payload !== null && 'success' in payload && 'data' in payload) {
      return (payload as { data?: T }).data ?? null
    }
    return payload as T
  }

  const fetchUsers = async () => {
    setLoading(true)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const raw = await res.json()
        setUsers(unwrapApiData<User[]>(raw) || [])
      }
    } catch (err) {
      console.error('Fetch users error:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateUser = async (id: number, data: Record<string, unknown>) => {
    setUpdating(id)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      })
      if (res.ok) fetchUsers()
    } catch (err) {
      console.error('Update user error:', err)
    }
    setUpdating(null)
  }

  const roleBadge = (role: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      admin: { label: t('employees.admin'), variant: 'default' },
      senior_agent: { label: t('employees.seniorAgent'), variant: 'secondary' },
      agent: { label: t('employees.agent'), variant: 'outline' },
    }
    const c = map[role] || { label: role, variant: 'outline' as const }
    return (
      <Badge variant={c.variant} className="text-[10px]">
        {c.label}
      </Badge>
    )
  }

  const handleImport = async () => {
    if (!importText.trim()) return
    setImporting(true)
    setImportResult(null)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch('/api/admin/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: importText, defaultPassword }),
      })
      const data = await res.json()
      if (data.success) {
        setImportResult(data.data)
        fetchUsers()
      }
    } catch (err) {
      console.error('Import error:', err)
    }
    setImporting(false)
  }

  const revokeUser = async (id: number, name: string) => {
    if (!window.confirm(`${t('admin.revokeUserBtn')} — ${name}?`)) return
    setRevokingId(id)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`/api/admin/sessions/revoke/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success(t('admin.revokeUserDone'))
      }
    } catch (err) {
      console.error('Revoke user error:', err)
      toast.error(t('common.error'))
    }
    setRevokingId(null)
  }

  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.docx')) {
      toast.error('Поддерживаются только файлы .docx')
      return
    }
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      if (result.value) {
        setImportText(result.value)
        setImportOpen(true)
        setImportResult(null)
      } else {
        toast.error('Не удалось извлечь текст из файла')
      }
    } catch (err) {
      console.error('DOCX parse error:', err)
      toast.error('Ошибка чтения файла .docx')
    }
    e.target.value = ''
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.users')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('admin.manage')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {t('admin.refresh')}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            setImportOpen(true)
            setImportResult(null)
            setImportText('')
          }}
        >
          <Upload className="w-4 h-4 mr-1.5" />
          Импорт из Word
        </Button>
        <input ref={fileInputRef} type="file" accept=".docx" className="hidden" onChange={handleDocxUpload} />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <FileText className="w-4 h-4 mr-1.5" />
          Загрузить .docx
        </Button>
      </div>

      {users.length === 0 && !loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold text-sm">{t('admin.noUsers')}</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {t('admin.allEmployees', { count: users.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors ${!user.isActive ? 'opacity-50' : ''}`}
                >
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate">{user.name}</span>
                      {roleBadge(user.role)}
                      {!user.isActive && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {t('admin.blocked')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {user.email} · {user.department || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      onChange={(e) => updateUser(user.id, { role: e.target.value })}
                      disabled={updating === user.id}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                    >
                      <option value="admin">{t('employees.admin')}</option>
                      <option value="senior_agent">{t('employees.seniorAgent')}</option>
                      <option value="agent">{t('employees.agent')}</option>
                    </select>
                    <Button
                      variant={user.isActive ? 'outline' : 'default'}
                      size="sm"
                      className="h-8 text-xs"
                      disabled={updating === user.id}
                      onClick={() => updateUser(user.id, { isActive: !user.isActive })}
                    >
                      {user.isActive ? (
                        <>
                          <UserX className="w-3 h-3 mr-1" /> {t('admin.blockBtn')}
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3 mr-1" /> {t('admin.unblockBtn')}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={revokingId === user.id}
                      onClick={() => revokeUser(user.id, user.name)}
                      aria-label={`${t('admin.revokeUserBtn')} — ${user.name}`}
                      data-testid={`revoke-user-${user.id}`}
                    >
                      {revokingId === user.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <LogOut className="w-3 h-3 mr-1" />
                      )}
                      {t('admin.revokeUserBtn')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">Импорт сотрудников из Word</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Загрузите файл <strong>.docx</strong> кнопкой «Загрузить .docx» или скопируйте таблицу из Word (Ctrl+C)
                и вставьте сюда.
                <br />
                Формат:{' '}
                <code className="bg-muted px-1 rounded">
                  отдел &quot;таб&quot; ФИО &quot;таб&quot; должность &quot;таб&quot; телефон
                </code>
                <br />
                Разделители — табуляция (Tab) или 2+ пробела.
              </p>
              <div className="mb-4">
                <label className="text-sm font-medium mb-1 block">Пароль по умолчанию:</label>
                <input
                  type="text"
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const file = e.dataTransfer.files[0]
                  if (file?.name.endsWith('.docx')) {
                    file.arrayBuffer().then((buf) =>
                      mammoth.extractRawText({ arrayBuffer: buf }).then((r) => {
                        if (r.value) setImportText(r.value)
                      }),
                    )
                  }
                }}
                className="mb-3 border-2 border-dashed rounded-md p-3 text-center text-xs text-muted-foreground hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="w-5 h-5 mx-auto mb-1 opacity-40" />
                Перетащите .docx файл сюда или нажмите для выбора
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  'IT\tИван Иванов\tМенеджер\t101\nПоддержка\tПетров Пётр\tАгент\t102\nРазработка\tСидорова Мария\tВедущий инженер\t103'
                }
                className="w-full h-64 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none"
              />
              {importResult && (
                <div className="mt-4 p-4 rounded-md bg-muted/50">
                  <p className="text-sm font-bold">
                    Импортировано: <span className="text-green-600">{importResult.created}</span> | Пропущено:{' '}
                    <span className="text-orange-600">{importResult.skipped}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Пароль для всех новых: <code className="bg-muted px-1 rounded">{importResult.defaultPassword}</code>
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-orange-600">Ошибки:</p>
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          • {e.name || '(пустое ФИО)'} — {e.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setImportOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={handleImport} disabled={importing || !importText.trim()}>
                  {importing
                    ? 'Импорт...'
                    : `Импорт (${importText.split(/\r?\n/).filter((l) => l.trim()).length} строк)`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
