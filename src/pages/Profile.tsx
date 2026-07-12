import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { User, Mail, Phone, Briefcase, MapPin, FileText, Settings, Camera, Save, Monitor, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { API_URL } from '@/lib/api'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user: authUser, token } = useAuth()
  const [employee, setEmployee] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', bio: '' })
  const [sysInfo, setSysInfo] = useState({ computerName: '', userAccount: '' })

  useEffect(() => {
    const saved = localStorage.getItem('sysInfo')
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSysInfo(JSON.parse(saved))
      return
    }
    fetch(`${API_URL}/system-info`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.computerName || data?.userAccount) {
          const info = { computerName: data.computerName || '', userAccount: data.userAccount || '' }
          setSysInfo(info)
          localStorage.setItem('sysInfo', JSON.stringify(info))
        }
      })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    fetch(`${API_URL}/employees`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body) => {
        const data = body.data || body
        const me = data.find((e: any) => e.id === authUser?.id) || {}
        setEmployee(me)
        setForm({
          name: me.name || '',
          email: me.email || '',
          phone: me.phone || '',
          title: me.title || '',
          bio: me.bio || '',
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token, authUser])

  const updateSysInfo = () => {
    const name = (document.getElementById('sys-computer') as HTMLInputElement)?.value || ''
    const account = (document.getElementById('sys-account') as HTMLInputElement)?.value || ''
    setSysInfo({ computerName: name, userAccount: account })
    localStorage.setItem('sysInfo', JSON.stringify({ computerName: name, userAccount: account }))
  }

  const saveProfile = () => {
    setEditing(false)
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  const displayName = employee?.name || authUser?.name || ''
  const displayRole = employee?.role || authUser?.role || 'agent'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
  const roleLabels: Record<string, string> = { agent: 'Агент', senior_agent: 'Ст. агент', admin: 'Администратор' }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('profile.subtitle')}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="w-3.5 h-3.5" /> {t('profile.title')}
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {t('nav.files')}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="w-3.5 h-3.5" /> {t('profile.settings')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-5 mb-6">
                <div className="relative">
                  <Avatar className="w-16 h-16 ring-2 ring-primary/20">
                    <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  {employee?.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-2">
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </div>
                  ) : (
                    <>
                      <h2 className="text-lg font-bold">{displayName}</h2>
                      <p className="text-sm text-muted-foreground">{employee?.title || ''}</p>
                      <Badge variant="secondary" className="mt-2 text-[9px]">
                        {roleLabels[displayRole] || displayRole} • {employee?.department || ''}
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {editing ? (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="profile-email" className="text-sm font-bold flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" /> {t('auth.email')}
                      </label>
                      <Input
                        id="profile-email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="profile-phone" className="text-sm font-bold flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5" /> {t('profile.phone')}
                      </label>
                      <Input
                        id="profile-phone"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="profile-title" className="text-sm font-bold flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5" /> {t('profile.position')}
                      </label>
                      <Input
                        id="profile-title"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="profile-bio" className="text-sm font-bold flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" /> {t('profile.bio')}
                      </label>
                      <Textarea
                        id="profile-bio"
                        value={form.bio}
                        onChange={(e) => setForm({ ...form, bio: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={saveProfile} className="gap-1.5">
                        <Save className="w-4 h-4" /> {t('common.save')}
                      </Button>
                      <Button variant="outline" onClick={cancelEdit}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 py-2 border-b">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('auth.email')}</p>
                        <p className="text-sm font-medium">{employee?.email || ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 py-2 border-b">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('profile.phone')}</p>
                        <p className="text-sm font-medium">{employee?.phone || ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 py-2 border-b">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('profile.position')}</p>
                        <p className="text-sm font-medium">{employee?.title || ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 py-2 border-b">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('profile.department')}</p>
                        <p className="text-sm font-medium">{employee?.department || ''}</p>
                      </div>
                    </div>
                    {form.bio && (
                      <div className="py-2">
                        <p className="text-xs text-muted-foreground mb-1">{t('profile.bio')}</p>
                        <p className="text-sm">{form.bio}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
                        <Camera className="w-4 h-4" /> {t('profile.editProfile')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Monitor className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm">{t('profile.currentDevice')}</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="sys-computer" className="text-xs text-muted-foreground mb-1 block">
                    {t('profile.computerName')}
                  </label>
                  <Input
                    id="sys-computer"
                    defaultValue={sysInfo.computerName}
                    onChange={updateSysInfo}
                    placeholder={t('profile.computerPlaceholder')}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="sys-account" className="text-xs text-muted-foreground mb-1 block">
                    {t('profile.userAccount')}
                  </label>
                  <Input
                    id="sys-account"
                    defaultValue={sysInfo.userAccount}
                    onChange={updateSysInfo}
                    placeholder={t('profile.accountPlaceholder')}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                {t('profile.myFiles')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">{t('profile.noFiles')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('profile.settings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t('profile.notifications')}
                </p>
                <label className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">{t('profile.notificationSound')}</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
                <label className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">{t('profile.pushNotifications')}</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
              </div>
              <div className="space-y-3 pt-3 border-t">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t('profile.privacy')}
                </p>
                <label className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">{t('profile.showOnlineStatus')}</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
