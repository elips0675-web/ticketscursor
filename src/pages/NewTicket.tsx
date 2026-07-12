import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTickets } from '@/context/ticket-context'
import { ArrowLeft, Monitor, Send } from 'lucide-react'
import type { TicketPriority } from '@/types'

export default function NewTicket() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createTicket } = useTickets()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [category, setCategory] = useState('support')
  const [computerName, setComputerName] = useState('')
  const [userAccount, setUserAccount] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('sysInfo')
    if (saved) {
      const { computerName: cn, userAccount: ua } = JSON.parse(saved)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cn) setComputerName(cn)
      if (ua) setUserAccount(ua)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    createTicket({
      title,
      description,
      priority,
      category,
      computerName: computerName || undefined,
      userAccount: userAccount || undefined,
    })
    navigate('/tickets')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')} className="gap-1.5">
        <ArrowLeft className="w-4 h-4" />
        {t('tickets.backToTickets')}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t('tickets.newTicketTitle')}</CardTitle>
          <CardDescription>{t('tickets.newTicketDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-bold">{t('tickets.subject')}</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('tickets.subjectPlaceholder')}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold">{t('tickets.description')}</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('tickets.descriptionPlaceholder')}
                className="min-h-[150px]"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold">{t('tickets.prioritySelect')}</label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('tickets.low')}</SelectItem>
                    <SelectItem value="medium">{t('tickets.medium')}</SelectItem>
                    <SelectItem value="high">{t('tickets.high')}</SelectItem>
                    <SelectItem value="critical">{t('tickets.critical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold">{t('tickets.categorySelect')}</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">{t('tickets.bug')}</SelectItem>
                    <SelectItem value="feature">{t('tickets.feature')}</SelectItem>
                    <SelectItem value="support">{t('tickets.support')}</SelectItem>
                    <SelectItem value="incident">{t('tickets.incident')}</SelectItem>
                    <SelectItem value="other">{t('tickets.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 p-3 rounded-lg bg-muted/30">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Monitor className="w-3 h-3" /> {t('tickets.sysInfo')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={computerName}
                  onChange={(e) => setComputerName(e.target.value)}
                  placeholder={t('tickets.computerPlaceholder')}
                />
                <Input
                  value={userAccount}
                  onChange={(e) => setUserAccount(e.target.value)}
                  placeholder={t('tickets.userPlaceholder')}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">{t('tickets.sysInfoAuto')}</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={() => navigate('/tickets')}>
                {t('tickets.cancel')}
              </Button>
              <Button type="submit" disabled={!title.trim() || !description.trim()}>
                <Send className="w-4 h-4 mr-1.5" />
                {t('tickets.create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
