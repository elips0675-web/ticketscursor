import { NavLink, useNavigate } from "react-router-dom"
import { Shield, LayoutDashboard, Users, Bell, Settings, History, ArrowLeft, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { useTranslation } from "react-i18next"
import LanguageSwitcher from "@/components/LanguageSwitcher"

const adminNavItems = [
  { to: "/admin", icon: LayoutDashboard, labelKey: "dashboard.title", end: true },
  { to: "/admin/users", icon: Users, labelKey: "admin.users" },
  { to: "/admin/push", icon: Bell, labelKey: "admin.push" },
  { to: "/admin/settings", icon: Settings, labelKey: "admin.settings" },
  { to: "/admin/audit", icon: History, labelKey: "admin.audit" },
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="w-16 h-16 text-muted-foreground/40" />
          <div className="text-center">
            <h2 className="text-xl font-bold">{t("common.notFound")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("admin.title")}</p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> {t("common.back")}
          </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <aside className="w-56 flex-col bg-sidebar text-sidebar-foreground shrink-0 hidden md:flex">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight">{t("admin.title")}</h1>
              <p className="text-[8px] text-sidebar-foreground/50 font-bold uppercase tracking-widest">Service Desk</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-sidebar-border space-y-0.5">
          <button
            onClick={() => navigate("/")}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("common.back")}
          </button>
          <button
            onClick={() => { logout(); window.location.href = "/login" }}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="w-4 h-4" />
            {t("auth.logout")}
          </button>
          <LanguageSwitcher />
        </div>
      </aside>
      <div className="flex flex-col flex-1 min-w-0">
        <MobileAdminHeader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

function MobileAdminHeader() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { t } = useTranslation()
  return (
    <div className="md:hidden flex items-center justify-between p-4 border-b bg-background">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
          <Shield className="w-3 h-3 text-white" />
        </div>
        <span className="font-bold text-sm">{t("admin.title")}</span>
      </div>
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground"
          title={t("common.back")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { logout(); window.location.href = "/login" }}
          className="text-muted-foreground hover:text-destructive"
          title={t("auth.logout")}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
