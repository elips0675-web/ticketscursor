import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/context/AuthContext"
import { useTranslation } from "react-i18next"

const DEPARTMENTS = [
  { id: 1, name: "IT" },
  { id: 2, name: "Поддержка" },
  { id: 3, name: "Разработка" },
  { id: 4, name: "Бухгалтерия" },
  { id: 5, name: "HR" },
]

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ name: "", email: "", password: "", department: "", title: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError(t("auth.fillRequired"))
      return
    }
    if (form.password.length < 6) {
      setError(t("auth.passwordTooShort"))
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.message || t("auth.registerError"))
        return
      }
      login(data.token, data.employee)
      navigate("/")
    } catch {
      setError(t("auth.connectionError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <span className="text-white font-bold text-lg">SD</span>
          </div>
          <CardTitle>{t("auth.registerTitle")}</CardTitle>
          <CardDescription>{t("auth.registerSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">{error}</div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="reg-name" className="text-sm font-bold">{t("auth.nameFull")}</label>
              <Input
                id="reg-name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={t("auth.namePlaceholder")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="text-sm font-bold">{t("auth.email")}</label>
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="ivan@company.ru"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="text-sm font-bold">{t("auth.password")}</label>
              <Input
                id="reg-password"
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={t("auth.passwordMin")}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reg-department" className="text-sm font-bold">{t("auth.department")}</label>
              <Select value={form.department} onValueChange={v => setForm({ ...form, department: v })}>
                <SelectTrigger id="reg-department">
                  <SelectValue placeholder={t("auth.departmentPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reg-title" className="text-sm font-bold">{t("auth.titlePosition")}</label>
              <Input
                id="reg-title"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={t("auth.titlePlaceholder")}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.registering") : t("auth.registerBtn")}
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground mt-6">
            {t("auth.hasAccount")}{" "}
            <Link to="/login" className="text-primary font-bold hover:underline">{t("auth.goToLogin")}</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
