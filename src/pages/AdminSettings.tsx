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
  { key: "TELEGRAM_BOT_TOKEN", label: "Telegram Bot Token", type: "password", section: "Telegram" },
  { key: "SMTP_HOST", label: "SMTP Host", type: "text", section: "Email (SMTP)" },
  { key: "SMTP_PORT", label: "SMTP Port", type: "text", section: "Email (SMTP)" },
  { key: "SMTP_SECURE", label: "SMTP Secure (true/false)", type: "text", section: "Email (SMTP)" },
  { key: "SMTP_USER", label: "SMTP User", type: "text", section: "Email (SMTP)" },
  { key: "SMTP_PASS", label: "SMTP Password", type: "password", section: "Email (SMTP)" },
  { key: "SMTP_FROM", label: "SMTP From", type: "text", section: "Email (SMTP)" },
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
      if (res.ok) toast.success("Settings saved")
      else toast.error("Failed to save")
    } catch { toast.error("Network error") }
    setSaving(false)
  }

  const sections = [...new Set(FIELDS.map(f => f.section))]

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure integrations</p>
      </div>

      {sections.map(section => (
        <Card key={section}>
          <CardHeader><CardTitle className="text-sm">{section}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.filter(f => f.section === section).map(f => (
              <div key={f.key}>
                <Label className="text-xs font-bold">{f.label}</Label>
                <div className="relative mt-1">
                  <Input
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
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  )
}
