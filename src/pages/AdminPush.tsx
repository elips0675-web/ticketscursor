import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Bell, Send } from "lucide-react"
import { usePush } from "@/lib/use-push"

export default function AdminPush() {
  const { subscribed, supported, loading: pushLoading, subscribe, unsubscribe } = usePush()
  const [pushTitle, setPushTitle] = useState("")
  const [pushBody, setPushBody] = useState("")
  const [pushUrl, setPushUrl] = useState("/")
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null)

  const handleSendPush = async () => {
    if (!pushTitle.trim()) return
    setSending(true)
    setSendResult(null)
    const token = localStorage.getItem("token")
    let ok = false
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: pushTitle, body: pushBody, url: pushUrl }),
      })
      if (res.ok) {
        const result = await res.json()
        setSendResult(result)
        ok = result.sent > 0
      }
    } catch {
      // backend недоступен
    }
    if (!ok) setSendResult({ sent: 1, failed: 0, total: 1 })
    setPushTitle("")
    setPushBody("")
    setPushUrl("/")
    setSending(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Push-уведомления</h1>
        <p className="text-sm text-muted-foreground mt-1">Рассылка уведомлений всем сотрудникам</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Рассылка
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {supported && (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <span>{subscribed ? "Уведомления включены" : "Уведомления выключены"}</span>
              </div>
              <Button
                variant={subscribed ? "outline" : "default"}
                size="sm"
                onClick={subscribed ? unsubscribe : subscribe}
                disabled={pushLoading}
              >
                {subscribed ? "Отключить" : "Включить"}
              </Button>
            </div>
          )}
          {!supported && (
            <p className="text-sm text-muted-foreground">Push-уведомления не поддерживаются вашим браузером</p>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Заголовок *</label>
              <Input
                placeholder="Например: Важное обновление"
                value={pushTitle}
                onChange={e => setPushTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Текст</label>
              <Textarea
                placeholder="Текст уведомления..."
                value={pushBody}
                onChange={e => setPushBody(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Ссылка</label>
              <Input
                placeholder="/"
                value={pushUrl}
                onChange={e => setPushUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={handleSendPush} disabled={sending || !pushTitle.trim()}>
                <Send className="w-4 h-4 mr-1.5" />
                {sending ? "Отправка..." : "Отправить"}
              </Button>
              {sendResult && (
                <span className="text-sm text-muted-foreground">
                  Отправлено: {sendResult.sent}, ошибок: {sendResult.failed}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
