import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { Save, Loader2, Eye, EyeOff } from "lucide-react"

const API = "http://localhost:4000/api"

const FIELDS = [
  { key: "TELEGRAM_BOT_TOKEN", label: "telegramToken", type: "password", section: "telegramSettings" },
  { key: "SMTP_HOST", label: "smtpHost", type: "text", section: "emailSettings" },
  { key: "SMTP_PORT", label: "smtpPort", type: "text", section: "emailSettings" },
  { key: "SMTP_SECURE", label: "smtpSecure", type: "text", section: "emailSettings" },
  { key: "SMTP_USER", label: "smtpUser", type: "text", section: "emailSettings" },
  { key: "SMTP_PASS", label: "smtpPass", type: "password", section: "emailSettings" },
  { key: "SMTP_FROM", label: "smtpFrom", type: "text", section: "emailSettings" },
]

export default function AdminSettings() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(`${API}/admin/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : {})
      .then(data => { setValues(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      })
      if (res.ok) toast.success(t("admin.saveSuccess"))
      else toast.error(t("admin.saveError"), { role: "alert" })
    } catch { toast.error(t("common.loading"), { role: "alert" }) }
    setSaving(false)
  }

  const sections = [...new Set(FIELDS.map(f => f.section))]

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.settings")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.settingsSubtitle")}</p>
      </div>

      {sections.map(section => (
        <Card key={section}>
          <CardHeader><CardTitle className="text-sm">{t(`admin.${section}`)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.filter(f => f.section === section).map(f => (
              <div key={f.key}>
                <Label htmlFor={f.key} className="text-xs font-bold">{t(`admin.${f.label}`)}</Label>
                <div className="relative mt-1">
                  <Input
                    id={f.key}
                    type={f.type === "password" && !show[f.key] ? "password" : "text"}
                    value={values[f.key] || ""}
                    onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="pr-8"
                  />
                  {f.type === "password" && (
                    <button
                      type="button"
                      onClick={() => setShow(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {show[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button onClick={save} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? t("common.loading") : t("common.save")}
      </Button>
    </div>
  )
}
