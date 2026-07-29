import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Save, Loader2, Trash2, MessageSquare } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface CannedResponse {
  id: number
  title: string
  text: string
  category: string
  created_by: number
  created_at: string
  updated_at: string
}

export default function AdminCannedResponses() {
  const { t } = useTranslation()
  const [items, setItems] = useState<CannedResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/canned-responses')
      setItems(data || [])
    } catch {
      toast.error(t('common.error'))
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!editTitle.trim() || !editText.trim()) return
    setSaving(true)
    try {
      await api.post('/canned-responses', { title: editTitle, text: editText, category: editCategory })
      toast.success(t('common.saveSuccess'))
      setEditTitle('')
      setEditText('')
      setEditCategory('')
      setEditing(null)
      await load()
    } catch {
      toast.error(t('common.error'))
    }
    setSaving(false)
  }

  const update = async (id: number) => {
    if (!editTitle.trim() || !editText.trim()) return
    setSaving(true)
    try {
      await api.put(`/canned-responses/${id}`, { title: editTitle, text: editText, category: editCategory })
      toast.success(t('common.saveSuccess'))
      setEditing(null)
      await load()
    } catch {
      toast.error(t('common.error'))
    }
    setSaving(false)
  }

  const remove = async (id: number) => {
    try {
      await api.delete(`/canned-responses/${id}`)
      toast.success(t('common.deleteSuccess'))
      await load()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const startEdit = (item: CannedResponse) => {
    setEditing(item.id)
    setEditTitle(item.title)
    setEditText(item.text)
    setEditCategory(item.category)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            {t('admin.cannedResponses')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 mb-4 p-3 rounded-lg border">
            <Input
              placeholder={t('admin.cannedTitle')}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <Input
              placeholder={t('admin.cannedCategory')}
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            />
            <Textarea
              placeholder={t('admin.cannedText')}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              onClick={editing ? () => update(editing) : create}
              disabled={saving || !editTitle.trim() || !editText.trim()}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {editing ? t('common.save') : t('common.add')}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('admin.cannedEmpty')}</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.category && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {item.category}
                        </span>
                      )}
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.text}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(item)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
